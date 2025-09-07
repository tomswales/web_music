class ChannelMeters extends HTMLElement {
    constructor() {
        super();
        this.audioContext = null;
        this.analyser = null;
        this.splitter = null;
        this.leftAnalyser = null;
        this.rightAnalyser = null;
        this.leftDataArray = null;
        this.rightDataArray = null;
        this.animationId = null;
        this.isRunning = false;
        this.leftBaseline = 0;
        this.rightBaseline = 0;
        this.calibrationSamples = 0;
        this.leftSmooth = 0;
        this.rightSmooth = 0;
        this.attackFactor = 0.8;
        this.decayFactor = 0.1;
        this.minLevel = 2;
        this.noiseGate = 25;
    }

    connectedCallback() {
        this.innerHTML = `
            <div class="channel-container">
                <div class="channel-row">
                    <span class="channel-label">L</span>
                    <div class="channel-bar-container">
                        <div class="channel-bar left-bar"></div>
                    </div>
                    <span class="channel-value left-value">0%</span>
                </div>
                <div class="channel-row">
                    <span class="channel-label">R</span>
                    <div class="channel-bar-container">
                        <div class="channel-bar right-bar"></div>
                    </div>
                    <span class="channel-value right-value">0%</span>
                </div>
            </div>
        `;
        
        this.leftBar = this.querySelector('.left-bar');
        this.rightBar = this.querySelector('.right-bar');
        this.leftValue = this.querySelector('.left-value');
        this.rightValue = this.querySelector('.right-value');
    }

    initAudio(audioContext, sourceNode) {
        this.audioContext = audioContext;
        
        this.splitter = this.audioContext.createChannelSplitter(2);
        this.leftAnalyser = this.audioContext.createAnalyser();
        this.rightAnalyser = this.audioContext.createAnalyser();
        
        this.leftAnalyser.fftSize = 256;
        this.rightAnalyser.fftSize = 256;
        this.leftAnalyser.smoothingTimeConstant = 0.85;
        this.rightAnalyser.smoothingTimeConstant = 0.85;
        
        this.leftDataArray = new Uint8Array(this.leftAnalyser.frequencyBinCount);
        this.rightDataArray = new Uint8Array(this.rightAnalyser.frequencyBinCount);
        
        sourceNode.connect(this.splitter);
        this.splitter.connect(this.leftAnalyser, 0);
        this.splitter.connect(this.rightAnalyser, 1);
        
        return true;
    }

    start() {
        this.isRunning = true;
        this.calibrateBaseline();
        this.animate();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        this.leftBar.style.width = '0%';
        this.rightBar.style.width = '0%';
        this.leftValue.textContent = '0%';
        this.rightValue.textContent = '0%';
        this.leftSmooth = 0;
        this.rightSmooth = 0;
    }

    animate() {
        if (!this.isRunning) return;
        
        this.leftAnalyser.getByteFrequencyData(this.leftDataArray);
        this.rightAnalyser.getByteFrequencyData(this.rightDataArray);
        
        const leftLevel = this.calculateFilteredRMS(this.leftDataArray, 'left');
        const rightLevel = this.calculateFilteredRMS(this.rightDataArray, 'right');
        
        const leftFactor = leftLevel > this.leftSmooth ? this.attackFactor : this.decayFactor;
        const rightFactor = rightLevel > this.rightSmooth ? this.attackFactor : this.decayFactor;
        
        this.leftSmooth = this.leftSmooth + (leftLevel - this.leftSmooth) * leftFactor;
        this.rightSmooth = this.rightSmooth + (rightLevel - this.rightSmooth) * rightFactor;
        
        this.leftSmooth = this.applyExponentialFloor(this.leftSmooth);
        this.rightSmooth = this.applyExponentialFloor(this.rightSmooth);
        
        this.updateBar(this.leftBar, this.leftValue, this.leftSmooth);
        this.updateBar(this.rightBar, this.rightValue, this.rightSmooth);
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    calculateFilteredRMS(dataArray, channel) {
        let sum = 0;
        let validSamples = 0;
        const baseline = channel === 'left' ? this.leftBaseline : this.rightBaseline;
        
        // Use only bottom 55% of frequency spectrum (focus on bass/mid frequencies)
        const usableRange = Math.floor(dataArray.length * 0.55);
        
        for (let i = 0; i < usableRange; i++) {
            const rawLevel = dataArray[i];
            const cleanLevel = Math.max(0, rawLevel - baseline);
            
            if (cleanLevel > this.noiseGate) {
                const normalized = cleanLevel / 255;
                sum += normalized * normalized;
                validSamples++;
            }
        }
        
        if (validSamples < 3) return 0;
        
        let rms = Math.sqrt(sum / validSamples);
        
        if (rms < 0.02) return 0;
        
        let percentage = rms * 200;
        
        if (percentage > 80) {
            percentage = 80 + (percentage - 80) * 0.3;
        }
        
        percentage = Math.min(95, percentage);
        percentage = Math.pow(percentage / 100, 0.6) * 100;
        
        return Math.max(0, percentage);
    }

    applyExponentialFloor(level) {
        if (level <= this.minLevel) {
            return this.minLevel;
        }
        
        const floorStrength = 8;
        const exponentialFloor = this.minLevel + (level - this.minLevel) * Math.pow(level / 100, 1 / floorStrength);
        
        return Math.max(this.minLevel, exponentialFloor);
    }

    calibrateBaseline() {
        this.leftBaseline = 0;
        this.rightBaseline = 0;
        this.calibrationSamples = 0;
        
        const calibrate = () => {
            if (this.calibrationSamples < 20 && this.isRunning) {
                this.leftAnalyser.getByteFrequencyData(this.leftDataArray);
                this.rightAnalyser.getByteFrequencyData(this.rightDataArray);
                
                let leftSum = 0, rightSum = 0;
                for (let i = 0; i < this.leftDataArray.length; i++) {
                    leftSum += this.leftDataArray[i];
                    rightSum += this.rightDataArray[i];
                }
                
                const leftAvg = leftSum / this.leftDataArray.length;
                const rightAvg = rightSum / this.rightDataArray.length;
                
                this.leftBaseline = Math.max(this.leftBaseline, leftAvg * 0.7);
                this.rightBaseline = Math.max(this.rightBaseline, rightAvg * 0.7);
                
                this.calibrationSamples++;
                setTimeout(calibrate, 150);
            }
        };
        
        setTimeout(calibrate, 1000);
    }

    updateBar(bar, valueLabel, level) {
        const clampedLevel = Math.min(100, Math.max(0, level));
        
        let visualWidth = clampedLevel;
        
        bar.style.width = `${visualWidth}%`;
        valueLabel.textContent = `${Math.round(clampedLevel)}%`;
        
        if (clampedLevel > 80) {
            bar.style.boxShadow = '0 0 8px #ff4444, 0 0 16px #ff4444';
        } else if (clampedLevel > 60) {
            bar.style.boxShadow = '0 0 6px #ffaa00, 0 0 12px #ffaa00';
        } else if (clampedLevel > 20) {
            bar.style.boxShadow = '0 0 4px #00ff41, 0 0 8px #00ff41';
        } else {
            bar.style.boxShadow = '0 0 2px #00ff41';
        }
    }

    destroy() {
        this.stop();
        
        if (this.leftAnalyser) {
            this.leftAnalyser.disconnect();
        }
        if (this.rightAnalyser) {
            this.rightAnalyser.disconnect();
        }
        if (this.splitter) {
            this.splitter.disconnect();
        }
    }
}

customElements.define('channel-meters', ChannelMeters);