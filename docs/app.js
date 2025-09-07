class MusicVisualizerApp {
    constructor() {
        this.visualizer = document.getElementById('visualizer');
        this.channelMeters = document.getElementById('channelMeters');
        this.status = document.getElementById('status');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.isRunning = false;
        
        this.createBackgroundCanvas();
        this.initEventListeners();
        this.attemptAutoStart();
    }

    initEventListeners() {
        document.addEventListener('click', () => {
            if (!this.isRunning) {
                this.startVisualizer();
            }
        }, { once: true });
        
        this.fullscreenBtn.addEventListener('click', () => this.enterFullscreen());
        
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen-mode');
            }
        });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning) {
                this.pauseVisualizer();
            } else if (!document.hidden && this.isRunning) {
                this.resumeVisualizer();
            }
        });
        
        window.addEventListener('beforeunload', () => {
            if (this.isRunning) {
                this.stopVisualizer();
            }
        });
    }

    async attemptAutoStart() {
        try {
            await this.startVisualizer();
        } catch (error) {
            this.updateStatus('Click anywhere to start audio visualizer');
        }
    }


    async startVisualizer() {
        try {
            this.updateStatus('Requesting microphone access...');
            
            const success = await this.visualizer.initAudio();
            
            if (!success) {
                throw new Error('Failed to initialize audio');
            }
            
            const channelSuccess = this.channelMeters.initAudio(
                this.visualizer.audioContext, 
                this.visualizer.microphone
            );
            
            if (!channelSuccess) {
                throw new Error('Failed to initialize channel meters');
            }
            
            this.visualizer.start();
            this.channelMeters.start();
            this.isRunning = true;
            
            this.updateStatus('Audio visualizer active');
            
        } catch (error) {
            console.error('Error starting visualizer:', error);
            this.handleError(error);
        }
    }

    stopVisualizer() {
        this.visualizer.stop();
        this.channelMeters.stop();
        this.isRunning = false;
        
        this.updateStatus('Audio visualizer stopped');
    }

    async enterFullscreen() {
        try {
            await document.documentElement.requestFullscreen();
            document.body.classList.add('fullscreen-mode');
        } catch (error) {
            console.error('Error entering fullscreen:', error);
            this.updateStatus('Fullscreen not supported in this browser');
        }
    }

    pauseVisualizer() {
        if (this.isRunning) {
            this.visualizer.stop();
            this.channelMeters.stop();
            this.updateStatus('Audio visualizer paused (tab hidden)');
        }
    }

    resumeVisualizer() {
        if (this.isRunning) {
            this.visualizer.start();
            this.channelMeters.start();
            this.updateStatus('Audio visualizer active');
        }
    }

    handleError(error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            this.updateStatus('Microphone access denied. Please grant permission and refresh.');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            this.updateStatus('No microphone found. Please connect a microphone and refresh.');
        } else if (error.name === 'NotSupportedError') {
            this.updateStatus('Audio capture not supported in this browser.');
        } else {
            this.updateStatus('Error accessing microphone. Check console for details.');
        }
    }



    updateStatus(message) {
        this.status.textContent = message;
        
        if (message.includes('Error') || message.includes('denied') || message.includes('not found')) {
            this.status.style.color = '#ff4444';
            this.status.style.borderColor = '#ff4444';
        } else if (message.includes('active')) {
            this.status.style.color = '#00ff41';
            this.status.style.borderColor = '#00ff41';
        } else {
            this.status.style.color = '#ffaa00';
            this.status.style.borderColor = 'rgba(255, 170, 0, 0.3)';
        }
    }

    createBackgroundCanvas() {
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundCanvas.id = 'psychedelic-background';
        this.backgroundCanvas.style.position = 'fixed';
        this.backgroundCanvas.style.top = '0';
        this.backgroundCanvas.style.left = '0';
        this.backgroundCanvas.style.width = '100vw';
        this.backgroundCanvas.style.height = '100vh';
        this.backgroundCanvas.style.zIndex = '-1';
        this.backgroundCanvas.style.pointerEvents = 'none';
        
        document.body.insertBefore(this.backgroundCanvas, document.body.firstChild);
        
        this.backgroundCtx = this.backgroundCanvas.getContext('2d');
        this.setupBackgroundCanvas();
        
        window.addEventListener('resize', () => this.setupBackgroundCanvas());
        
        this.backgroundRenderer = new PsychedelicBackground(this.backgroundCanvas, this.backgroundCtx);
        this.startBackgroundAnimation();
    }

    setupBackgroundCanvas() {
        this.backgroundCanvas.width = window.innerWidth;
        this.backgroundCanvas.height = window.innerHeight;
    }

    getVisualizerData() {
        if (this.visualizer && this.visualizer.isRunning) {
            return {
                musicEnergy: this.visualizer.musicEnergy || 0,
                bassEnergy: this.visualizer.bassEnergy || 0,
                midEnergy: this.visualizer.midEnergy || 0,
                trebleEnergy: this.visualizer.trebleEnergy || 0
            };
        }
        return { musicEnergy: 0, bassEnergy: 0, midEnergy: 0, trebleEnergy: 0 };
    }

    startBackgroundAnimation() {
        const animateBackground = () => {
            const musicData = this.getVisualizerData();
            this.backgroundRenderer.render(musicData);
            requestAnimationFrame(animateBackground);
        };
        animateBackground();
    }
}

class PsychedelicBackground {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.time = 0;
    }

    render(musicData) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const { musicEnergy, bassEnergy, midEnergy, trebleEnergy } = musicData;
        this.time += 0.01 + (musicEnergy / 5000);
        
        this.ctx.save();
        this.ctx.globalAlpha = 0.05 + (musicEnergy / 2000);
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Draw multiple symmetric layers
        for (let layer = 0; layer < 3; layer++) {
            this.drawSymmetricLayer(centerX, centerY, layer, musicData);
        }
        
        this.ctx.restore();
    }

    drawSymmetricLayer(centerX, centerY, layer, musicData) {
        const { bassEnergy, midEnergy, trebleEnergy, musicEnergy } = musicData;
        const layerOffset = layer * 0.3;
        const time = this.time + layerOffset;
        const energy = musicEnergy / 100;
        
        // Create radial symmetry points
        const symmetryPoints = 8 + Math.floor(bassEnergy / 10);
        const radius = Math.min(this.canvas.width, this.canvas.height) * (0.3 + layer * 0.2);
        
        this.ctx.strokeStyle = this.getPsychedelicColor(layer, time, musicData);
        this.ctx.lineWidth = 0.5 + energy;
        
        this.ctx.beginPath();
        
        for (let i = 0; i < symmetryPoints; i++) {
            const angle = (i / symmetryPoints) * Math.PI * 2;
            const nextAngle = ((i + 1) / symmetryPoints) * Math.PI * 2;
            
            // Create flowing, organic shapes
            const r1 = radius + Math.sin(time * 2 + angle * 3) * (20 + midEnergy / 5);
            const r2 = radius + Math.sin(time * 1.5 + nextAngle * 4) * (25 + trebleEnergy / 4);
            
            const x1 = centerX + Math.cos(angle + time * 0.5) * r1;
            const y1 = centerY + Math.sin(angle + time * 0.5) * r1;
            
            if (i === 0) {
                this.ctx.moveTo(x1, y1);
            } else {
                // Create curved connections
                const cpx = centerX + Math.cos(angle + time * 0.2) * (radius * 0.7);
                const cpy = centerY + Math.sin(angle + time * 0.2) * (radius * 0.7);
                this.ctx.quadraticCurveTo(cpx, cpy, x1, y1);
            }
        }
        
        this.ctx.closePath();
        this.ctx.stroke();
        
        // Add inner mandala patterns
        this.drawMandalaPattern(centerX, centerY, radius * 0.5, time + layerOffset, layer, musicData);
    }

    drawMandalaPattern(centerX, centerY, radius, time, layer, musicData) {
        const { bassEnergy, trebleEnergy, musicEnergy } = musicData;
        const petals = 6 + Math.floor(bassEnergy / 15);
        const energy = musicEnergy / 200;
        
        this.ctx.strokeStyle = this.getPsychedelicColor(layer + 1, time * 1.5, musicData);
        this.ctx.lineWidth = 0.3 + energy;
        
        for (let i = 0; i < petals; i++) {
            const angle = (i / petals) * Math.PI * 2;
            const petalRadius = radius * (0.3 + Math.sin(time + angle * 2) * 0.2);
            
            this.ctx.beginPath();
            
            // Create petal shapes
            for (let j = 0; j <= 20; j++) {
                const t = j / 20;
                const petalAngle = angle + (t - 0.5) * Math.PI * 0.4;
                const r = petalRadius * Math.sin(t * Math.PI) * (1 + trebleEnergy / 100);
                
                const x = centerX + Math.cos(petalAngle) * r;
                const y = centerY + Math.sin(petalAngle) * r;
                
                if (j === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            
            this.ctx.stroke();
        }
    }

    getPsychedelicColor(layer, time, musicData) {
        const { bassEnergy, midEnergy, trebleEnergy } = musicData;
        const bassInfluence = bassEnergy / 100;
        const midInfluence = midEnergy / 100;
        const trebleInfluence = trebleEnergy / 100;
        
        // Dark, muted color palette
        let r, g, b;
        
        switch (layer % 3) {
            case 0:
                // Deep purple/magenta
                r = Math.floor(20 + Math.sin(time) * 15 + bassInfluence * 10);
                g = Math.floor(5 + Math.sin(time * 1.3) * 8 + midInfluence * 5);
                b = Math.floor(25 + Math.sin(time * 0.8) * 20 + trebleInfluence * 15);
                break;
            case 1:
                // Dark teal/blue
                r = Math.floor(5 + Math.sin(time * 1.1) * 10 + midInfluence * 8);
                g = Math.floor(15 + Math.sin(time * 0.9) * 12 + trebleInfluence * 10);
                b = Math.floor(30 + Math.sin(time * 1.4) * 18 + bassInfluence * 12);
                break;
            default:
                // Dark green/yellow
                r = Math.floor(10 + Math.sin(time * 0.7) * 8 + trebleInfluence * 6);
                g = Math.floor(20 + Math.sin(time * 1.2) * 15 + bassInfluence * 10);
                b = Math.floor(8 + Math.sin(time * 1.6) * 6 + midInfluence * 8);
                break;
        }
        
        // Keep colors muted and dark
        r = Math.min(60, Math.max(5, r));
        g = Math.min(60, Math.max(5, g));
        b = Math.min(60, Math.max(5, b));
        
        return `rgb(${r}, ${g}, ${b})`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicVisualizerApp();
});