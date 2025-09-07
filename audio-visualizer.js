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
        this.barCount = 64;
        this.peakHoldTime = 200;
        this.barPeaks = new Array(64).fill(0);
        this.barPeakTimes = new Array(64).fill(0);
        this.barSmoothValues = new Array(64).fill(0);
        this.smoothingFactor = 0.3;
        this.spectrumHistory = [];
        this.maxHistoryLayers = 10;
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
        
        const usableRange = Math.floor(this.bufferLength * 0.6);
        const barWidth = Math.floor(usableRange / this.barCount);
        
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
        }
        
        this.updateSpectrumHistory();
        this.draw3DSpectrum();
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    updateSpectrumHistory() {
        this.spectrumHistory.unshift([...this.barSmoothValues]);
        if (this.spectrumHistory.length > this.maxHistoryLayers) {
            this.spectrumHistory.pop();
        }
    }

    draw3DSpectrum() {
        for (let layer = this.spectrumHistory.length - 1; layer >= 0; layer--) {
            const spectrum = this.spectrumHistory[layer];
            if (!spectrum) continue;
            
            const opacity = 1 - (layer / this.maxHistoryLayers);
            const depth = layer * this.depthSpacing;
            const scale = 1 - (layer * 0.05);
            
            this.drawSpectrumLayer(spectrum, depth, opacity, scale, layer === 0);
        }
    }

    drawSpectrumLayer(spectrum, depth, opacity, scale, isFrontLayer) {
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
            
            this.ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            this.ctx.fillRect(x, y, barWidth, barHeight);
            
            if (isFrontLayer && heightPercent > 70) {
                this.ctx.shadowColor = '#00ff41';
                this.ctx.shadowBlur = 12 * opacity;
                this.ctx.fillRect(x, y, barWidth, barHeight);
                this.ctx.shadowBlur = 0;
            } else if (isFrontLayer && heightPercent > 40) {
                this.ctx.shadowColor = '#00ff41';
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
        let barHeight = (rawLevel / 255) * 100;
        
        return Math.max(1, Math.min(100, barHeight));
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
}

customElements.define('audio-visualizer', AudioVisualizer);