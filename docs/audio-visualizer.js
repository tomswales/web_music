class AudioVisualizer extends HTMLElement {
    constructor() {
        super();
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.bufferLength = 0;
        this.animationId = null;
        this.isRunning = false;
        this.bars = [];
        this.barCount = 48;
        this.peakHoldTime = 200;
        this.barPeaks = new Array(48).fill(0);
        this.barPeakTimes = new Array(48).fill(0);
        this.barSmoothValues = new Array(48).fill(0);
        this.smoothingFactor = 0.3;
        this.spectrumHistory = [];
        this.maxHistoryLayers = 10;
        this.fullscreenHistoryLayers = 15;
        this.particles = [];
        this.particlePool = [];
        this.maxParticles = 200;
        this.peakThreshold = 15;
        this.rollingAverages = new Array(48).fill(0);
        this.musicEnergy = 0;
        this.bassEnergy = 0;
        this.midEnergy = 0;
        this.trebleEnergy = 0;
    }

    connectedCallback() {
        this.innerHTML = '<canvas class="visualizer-canvas"></canvas>';
        this.canvas = this.querySelector('.visualizer-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        
        this.resizeObserver = new ResizeObserver(() => this.setupCanvas());
        this.resizeObserver.observe(this);
    }

    setupCanvas() {
        const rect = this.getBoundingClientRect();
        this.canvas.width = rect.width || 800;
        this.canvas.height = rect.height || 200;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        
        this.baseBarSpacing = 1;
        const availableWidth = this.canvas.width;
        const totalSpacing = (this.barCount - 1) * this.baseBarSpacing;
        const widthForBarsAndMargins = availableWidth - totalSpacing;
        this.baseBarWidth = widthForBarsAndMargins / (this.barCount + 2);
        this.marginWidth = this.baseBarWidth;
        this.depthSpacing = this.canvas.height * 0.05;
    }

    async initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.5;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            
            this.microphone.connect(this.analyser);
            
            return true;
        } catch (error) {
            console.error('Error accessing microphone:', error);
            return false;
        }
    }

    start() {
        if (!this.audioContext || !this.analyser) {
            throw new Error('Audio not initialized');
        }
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.isRunning = true;
        this.animate();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        this.barSmoothValues.fill(0);
        this.spectrumHistory = [];
        this.particles = [];
        this.rollingAverages.fill(0);
        this.musicEnergy = 0;
        this.bassEnergy = 0;
        this.midEnergy = 0;
        this.trebleEnergy = 0;
        this.clearCanvas();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    animate() {
        if (!this.isRunning) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        const currentTime = Date.now();
        
        this.clearCanvas();
        
        const usableRange = Math.floor(this.bufferLength * 0.55);
        const barWidth = Math.max(1, Math.floor(usableRange / this.barCount));
        
        for (let i = 0; i < this.barCount; i++) {
            let sum = 0;
            const startIndex = i * barWidth;
            const endIndex = Math.min(startIndex + barWidth, usableRange);
            
            for (let j = startIndex; j < endIndex; j++) {
                sum += this.dataArray[j];
            }
            
            const average = sum / (endIndex - startIndex);
            let barHeight = this.processAudioLevel(average);
            
            this.barSmoothValues[i] = this.barSmoothValues[i] + (barHeight - this.barSmoothValues[i]) * this.smoothingFactor;
            
            if (this.barSmoothValues[i] > this.barPeaks[i]) {
                this.barPeaks[i] = this.barSmoothValues[i];
                this.barPeakTimes[i] = currentTime;
            } else if (currentTime - this.barPeakTimes[i] > this.peakHoldTime) {
                this.barPeaks[i] = Math.max(this.barPeaks[i] * 0.85, this.barSmoothValues[i]);
            } else {
                this.barPeaks[i] = Math.max(this.barPeaks[i] * 0.98, this.barSmoothValues[i]);
            }
            
            const displayHeight = Math.max(this.barSmoothValues[i], this.barPeaks[i] * 0.5);
            this.barSmoothValues[i] = displayHeight;
            
            this.updateRollingAverage(i, barHeight);
            this.detectFrequencyPeaks(i, barHeight, displayHeight);
        }
        
        this.calculateMusicEnergy();
        this.updateSpectrumHistory();
        this.updateParticles();
        this.draw3DSpectrum();
        this.drawParticles();
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    updateSpectrumHistory() {
        this.spectrumHistory.unshift([...this.barSmoothValues]);
        const maxLayers = document.body.classList.contains('fullscreen-mode') 
            ? this.fullscreenHistoryLayers 
            : this.maxHistoryLayers;
        
        if (this.spectrumHistory.length > maxLayers) {
            this.spectrumHistory.pop();
        }
    }

    draw3DSpectrum() {
        for (let layer = this.spectrumHistory.length - 1; layer >= 0; layer--) {
            const spectrum = this.spectrumHistory[layer];
            if (!spectrum) continue;
            
            const maxLayers = document.body.classList.contains('fullscreen-mode') 
                ? this.fullscreenHistoryLayers 
                : this.maxHistoryLayers;
            const opacity = 1 - (layer / maxLayers);
            const depth = layer * this.depthSpacing;
            const scale = 1 - (layer * 0.05);
            
            this.drawSpectrumLayer(spectrum, depth, opacity, scale, layer === 0, layer);
        }
    }

    drawSpectrumLayer(spectrum, depth, opacity, scale, isFrontLayer, layer) {
        const barWidth = this.baseBarWidth * scale;
        const barSpacing = this.baseBarSpacing * scale;
        const marginWidth = this.marginWidth * scale;
        const totalWidth = this.barCount * barWidth + (this.barCount - 1) * barSpacing + 2 * marginWidth;
        const startX = (this.canvas.width - totalWidth) / 2 + marginWidth;
        const baseY = this.canvas.height * 0.9 - depth;
        
        for (let i = 0; i < spectrum.length; i++) {
            const heightPercent = spectrum[i];
            const x = startX + i * (barWidth + barSpacing);
            const barHeight = (heightPercent / 100) * this.canvas.height * 0.7 * scale;
            const y = baseY - barHeight;
            
            let alpha = opacity * 0.8;
            if (isFrontLayer) {
                alpha = Math.min(1, opacity + 0.3);
            }
            
            // Calculate color gradient from neon green (front) to neon blue (back)
            const maxLayers = document.body.classList.contains('fullscreen-mode') 
                ? this.fullscreenHistoryLayers 
                : this.maxHistoryLayers;
            const layerProgress = layer / (maxLayers - 1); // 0 = front, 1 = back
            
            // Neon green: (0, 255, 65) -> Neon blue: (0, 65, 255)
            const red = 0;
            const green = Math.round(255 - (190 * layerProgress)); // 255 -> 65
            const blue = Math.round(65 + (190 * layerProgress));   // 65 -> 255
            
            this.ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
            this.ctx.fillRect(x, y, barWidth, barHeight);
            
            // Update shadow colors to match the gradient
            const shadowColor = `rgb(${red}, ${green}, ${blue})`;
            
            if (isFrontLayer && heightPercent > 70) {
                this.ctx.shadowColor = shadowColor;
                this.ctx.shadowBlur = 12 * opacity;
                this.ctx.fillRect(x, y, barWidth, barHeight);
                this.ctx.shadowBlur = 0;
            } else if (isFrontLayer && heightPercent > 40) {
                this.ctx.shadowColor = shadowColor;
                this.ctx.shadowBlur = 6 * opacity;
                this.ctx.fillRect(x, y, barWidth, barHeight);
                this.ctx.shadowBlur = 0;
            }
        }
    }


    getLogFrequencyRange(barIndex) {
        const minFreq = 1;
        const maxFreq = this.bufferLength - 1;
        const logMin = Math.log(minFreq);
        const logMax = Math.log(maxFreq);
        const scale = (logMax - logMin) / this.barCount;
        
        const startLog = logMin + scale * barIndex;
        const endLog = logMin + scale * (barIndex + 1);
        
        const start = Math.floor(Math.exp(startLog));
        const end = Math.min(Math.floor(Math.exp(endLog)), maxFreq);
        
        return {
            start: Math.max(start, minFreq),
            end: Math.max(end, start)
        };
    }

    processAudioLevel(rawLevel) {
        // Apply sigmoid scaling for better noise handling and musical sensitivity
        return this.applySigmoidScaling(rawLevel);
    }

    applySigmoidScaling(rawLevel) {
        // Sigmoid parameters optimized for laptop recording with extreme high-end compression
        const noiseFloor = 40;      // Higher threshold to suppress laptop fan noise
        const midpoint = 55;        // Very low midpoint for early compression
        const steepness = 0.03;     // Extremely gentle curve for maximum tail-off
        const maxHeight = 100;      // Maximum bar height
        
        // Apply noise floor - values below this get heavily suppressed
        const noiseAdjustedInput = Math.max(0, (rawLevel - noiseFloor) / (255 - noiseFloor));
        
        // Sigmoid function: 1 / (1 + e^(-steepness * (input - midpoint)))
        const sigmoidInput = (noiseAdjustedInput * 255 - midpoint) * steepness;
        const sigmoidOutput = 1 / (1 + Math.exp(-sigmoidInput));
        
        // Scale to desired output range and ensure minimum visibility for any signal
        const scaledHeight = sigmoidOutput * maxHeight;
        const finalHeight = rawLevel > noiseFloor ? scaledHeight : (rawLevel / noiseFloor) * 5;
        
        return Math.max(1, Math.min(100, finalHeight));
    }


    destroy() {
        this.stop();
        
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        if (this.microphone) {
            this.microphone.disconnect();
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
    }

    updateRollingAverage(barIndex, currentValue) {
        this.rollingAverages[barIndex] = this.rollingAverages[barIndex] * 0.95 + currentValue * 0.05;
    }

    detectFrequencyPeaks(barIndex, rawValue, displayHeight) {
        const threshold = this.rollingAverages[barIndex] + this.peakThreshold;
        
        if (rawValue > threshold && displayHeight > 20) {
            this.spawnParticle(barIndex, displayHeight, rawValue);
        }
    }

    spawnParticle(barIndex, height, intensity) {
        if (this.particles.length >= this.maxParticles) {
            return;
        }
        
        let particle = this.particlePool.pop();
        if (!particle) {
            particle = {};
        }
        
        const barWidth = this.baseBarWidth * 1;
        const barSpacing = this.baseBarSpacing * 1;
        const marginWidth = this.marginWidth * 1;
        const totalWidth = this.barCount * barWidth + (this.barCount - 1) * barSpacing + 2 * marginWidth;
        const startX = (this.canvas.width - totalWidth) / 2 + marginWidth;
        
        particle.x = startX + barIndex * (barWidth + barSpacing) + barWidth / 2;
        particle.y = this.canvas.height * 0.9 - (height / 100) * this.canvas.height * 0.7;
        particle.vx = (Math.random() - 0.5) * 2;
        particle.vy = -Math.random() * 3 - 1;
        particle.life = 1.0;
        particle.decay = 0.01 + Math.random() * 0.01;
        particle.size = 2 + (intensity / 100) * 3;
        particle.frequency = barIndex;
        particle.color = this.getFrequencyColor(barIndex, intensity);
        
        this.particles.push(particle);
    }

    getFrequencyColor(barIndex, intensity) {
        const frequencyRatio = barIndex / (this.barCount - 1);
        const brightness = Math.max(0.6, Math.min(intensity / 80, 1)); // Minimum 60% brightness, max at 80% intensity
        
        let r, g, b;
        
        if (frequencyRatio < 0.2) {
            // Hot Magenta/Pink (bass)
            r = 255;
            g = 20;
            b = 147;
        } else if (frequencyRatio < 0.4) {
            // Neon Orange (low-mid)
            r = 255;
            g = 140;
            b = 0;
        } else if (frequencyRatio < 0.6) {
            // Electric Yellow (mid)
            r = 255;
            g = 255;
            b = 0;
        } else if (frequencyRatio < 0.8) {
            // Neon Green (high-mid)
            r = 50;
            g = 255;
            b = 50;
        } else {
            // Electric Cyan (treble)
            r = 0;
            g = 255;
            b = 255;
        }
        
        // Apply brightness while keeping the neon saturation
        r = Math.round(r * brightness);
        g = Math.round(g * brightness);
        b = Math.round(b * brightness);
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.1;
            particle.vx *= 0.99;
            particle.life -= particle.decay;
            
            if (particle.life <= 0) {
                const deadParticle = this.particles.splice(i, 1)[0];
                this.particlePool.push(deadParticle);
            }
        }
    }

    drawParticles() {
        for (const particle of this.particles) {
            const alpha = particle.life;
            const size = particle.size * particle.life;
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = particle.color;
            
            this.ctx.shadowColor = particle.color;
            this.ctx.shadowBlur = size * 2;
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.restore();
        }
    }

    calculateMusicEnergy() {
        this.bassEnergy = 0;
        this.midEnergy = 0;
        this.trebleEnergy = 0;
        
        const bassRange = Math.floor(this.barCount * 0.2);
        const midRange = Math.floor(this.barCount * 0.6);
        
        for (let i = 0; i < bassRange; i++) {
            this.bassEnergy += this.barSmoothValues[i];
        }
        for (let i = bassRange; i < midRange; i++) {
            this.midEnergy += this.barSmoothValues[i];
        }
        for (let i = midRange; i < this.barCount; i++) {
            this.trebleEnergy += this.barSmoothValues[i];
        }
        
        this.bassEnergy /= bassRange;
        this.midEnergy /= (midRange - bassRange);
        this.trebleEnergy /= (this.barCount - midRange);
        this.musicEnergy = (this.bassEnergy + this.midEnergy + this.trebleEnergy) / 3;
    }

}

customElements.define('audio-visualizer', AudioVisualizer);