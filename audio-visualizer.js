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
            this.drawBar(i, displayHeight);
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