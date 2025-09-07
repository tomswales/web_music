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
        this.backgroundNoise = null;
        this.noiseCalibrationCount = 0;
        this.noiseMargin = 5;
        this.manualCalibrationActive = false;
        this.calibrationSamples = [];
        this.loadStoredNoiseProfile();
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
        
        this.barWidth = (this.canvas.width / this.barCount) - 1;
        this.barSpacing = 1;
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
            
            if (!this.backgroundNoise) {
                this.backgroundNoise = new Array(this.bufferLength).fill(0);
            }
            
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
        if (!this.backgroundNoise || this.backgroundNoise.every(val => val === 0)) {
            this.calibrateNoise();
        }
        this.animate();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        this.barSmoothValues.fill(0);
        this.clearCanvas();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    animate() {
        if (!this.isRunning) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        const currentTime = Date.now();
        
        if (this.manualCalibrationActive) {
            this.recordCalibrationSample();
        }
        
        this.clearCanvas();
        
        const usableRange = Math.floor(this.bufferLength * 0.6);
        const barWidth = Math.floor(usableRange / this.barCount);
        
        for (let i = 0; i < this.barCount; i++) {
            let sum = 0;
            let noiseSum = 0;
            const startIndex = i * barWidth;
            const endIndex = Math.min(startIndex + barWidth, usableRange);
            
            for (let j = startIndex; j < endIndex; j++) {
                sum += this.dataArray[j];
                if (this.backgroundNoise && j < this.backgroundNoise.length) {
                    noiseSum += this.backgroundNoise[j];
                }
            }
            
            const average = sum / (endIndex - startIndex);
            const noiseAverage = noiseSum / (endIndex - startIndex);
            let barHeight = this.processAudioLevel(average, noiseAverage);
            
            if (!this.manualCalibrationActive) {
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
                this.drawBar(i, displayHeight);
            } else {
                this.drawCalibrationBar(i);
            }
        }
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    drawBar(barIndex, heightPercent) {
        const x = barIndex * (this.barWidth + this.barSpacing);
        const barHeight = (heightPercent / 100) * this.canvas.height;
        const y = this.canvas.height - barHeight;
        
        this.ctx.fillStyle = '#00ff41';
        this.ctx.fillRect(x, y, this.barWidth, barHeight);
        
        if (heightPercent > 70) {
            this.ctx.shadowColor = '#00ff41';
            this.ctx.shadowBlur = 16;
            this.ctx.fillRect(x, y, this.barWidth, barHeight);
            this.ctx.shadowBlur = 0;
        } else if (heightPercent > 40) {
            this.ctx.shadowColor = '#00ff41';
            this.ctx.shadowBlur = 8;
            this.ctx.fillRect(x, y, this.barWidth, barHeight);
            this.ctx.shadowBlur = 0;
        }
    }

    drawCalibrationBar(barIndex) {
        const x = barIndex * (this.barWidth + this.barSpacing);
        const barHeight = 4;
        const y = this.canvas.height - barHeight;
        
        this.ctx.fillStyle = '#ff4444';
        this.ctx.fillRect(x, y, this.barWidth, barHeight);
        
        this.ctx.shadowColor = '#ff4444';
        this.ctx.shadowBlur = 4;
        this.ctx.fillRect(x, y, this.barWidth, barHeight);
        this.ctx.shadowBlur = 0;
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

    processAudioLevel(rawLevel, noiseLevel = 0) {
        const cleanedLevel = Math.max(0, rawLevel - noiseLevel - this.noiseMargin);
        let barHeight = (cleanedLevel / 255) * 100;
        
        return Math.max(1, Math.min(100, barHeight));
    }

    calibrateNoise() {
        this.noiseCalibrationCount = 0;
        if (!this.backgroundNoise) {
            this.backgroundNoise = new Array(this.bufferLength).fill(0);
        } else {
            this.backgroundNoise.fill(0);
        }
        
        const calibrateStep = () => {
            if (this.noiseCalibrationCount < 30 && this.isRunning) {
                this.analyser.getByteFrequencyData(this.dataArray);
                
                const usableRange = Math.floor(this.backgroundNoise.length * 0.6);
                
                for (let i = 0; i < usableRange; i++) {
                    this.backgroundNoise[i] = Math.max(this.backgroundNoise[i], 
                        this.dataArray[Math.min(i, this.dataArray.length - 1)] * 0.8);
                }
                
                for (let i = usableRange; i < this.backgroundNoise.length; i++) {
                    this.backgroundNoise[i] = 0;
                }
                
                this.noiseCalibrationCount++;
                setTimeout(calibrateStep, 100);
            }
        };
        
        setTimeout(calibrateStep, 500);
    }

    async startManualCalibration() {
        if (!this.audioContext || !this.analyser) {
            const success = await this.initAudio();
            if (!success) return false;
        }
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.manualCalibrationActive = true;
        this.calibrationSamples = [];
        this.isRunning = true;
        this.animate();
        
        return true;
    }

    stopManualCalibration() {
        this.manualCalibrationActive = false;
        
        if (this.calibrationSamples.length > 0) {
            this.processCalibrationSamples();
            this.saveNoiseProfile();
        }
        
        if (!this.isRunning) {
            this.stop();
        }
    }

    recordCalibrationSample() {
        const sample = Array.from(this.dataArray);
        this.calibrationSamples.push(sample);
        
        if (this.calibrationSamples.length >= 100) {
            this.stopManualCalibration();
        }
    }

    processCalibrationSamples() {
        if (!this.backgroundNoise) {
            this.backgroundNoise = new Array(this.bufferLength).fill(0);
        } else {
            this.backgroundNoise.fill(0);
        }
        
        const usableRange = Math.floor(this.bufferLength * 0.6);
        
        for (let freqBin = 0; freqBin < usableRange; freqBin++) {
            let maxValue = 0;
            
            for (const sample of this.calibrationSamples) {
                const value = sample[Math.min(freqBin, sample.length - 1)];
                maxValue = Math.max(maxValue, value);
            }
            
            this.backgroundNoise[freqBin] = maxValue * 0.9;
        }
        
        for (let freqBin = usableRange; freqBin < this.backgroundNoise.length; freqBin++) {
            this.backgroundNoise[freqBin] = 0;
        }
    }

    saveNoiseProfile() {
        try {
            const profile = {
                timestamp: Date.now(),
                noiseProfile: Array.from(this.backgroundNoise)
            };
            localStorage.setItem('neonVisualizerNoiseProfile', JSON.stringify(profile));
        } catch (error) {
            console.warn('Could not save noise profile to localStorage:', error);
        }
    }

    loadStoredNoiseProfile() {
        try {
            const stored = localStorage.getItem('neonVisualizerNoiseProfile');
            if (stored) {
                const profile = JSON.parse(stored);
                const age = Date.now() - profile.timestamp;
                
                if (age < 7 * 24 * 60 * 60 * 1000) {
                    this.backgroundNoise = profile.noiseProfile;
                    return true;
                }
            }
        } catch (error) {
            console.warn('Could not load noise profile from localStorage:', error);
        }
        this.backgroundNoise = null;
        return false;
    }

    clearStoredNoiseProfile() {
        try {
            localStorage.removeItem('neonVisualizerNoiseProfile');
            this.backgroundNoise = null;
        } catch (error) {
            console.warn('Could not clear noise profile:', error);
        }
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