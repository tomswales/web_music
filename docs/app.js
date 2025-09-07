class MusicVisualizerApp {
    constructor() {
        this.visualizer = document.getElementById('visualizer');
        this.channelMeters = document.getElementById('channelMeters');
        this.status = document.getElementById('status');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.isRunning = false;
        
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
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicVisualizerApp();
});