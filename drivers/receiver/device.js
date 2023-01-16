'use strict';

const Homey = require('homey');
const YamahaYXC = require('yamaha-yxc-nodejs').YamahaYXC;

const CAPABILITY_DEBOUNCE = 500;

class receiverDevice extends Homey.Device {

    // Device init ========================================================================================================
    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id);

        // device attributes
        this._intervalUpdateDevice = null;
        this._yamaha = null;
        this._deviceState = {
            minVol: 0,
            maxVol: 100
        }
        this.mediaCover = null;
        this.mediaImage = await this.homey.images.createImage();
        this.mediaImage.setStream(async (stream) => {
            return await this.upateAlbumArtImage(stream);
        });
        await this.setAlbumArtImage(this.mediaImage);
        // this.setCameraImage('artwork', "Artwork", this.mediaImage);

        this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
            await this._onCapability( capabilityValues, capabilityOptions);
        }, CAPABILITY_DEBOUNCE);

        await this._connect();
        await this._startInterval();
    } // end onInit

    async fixCapabilities() {
        let deprecatedCapabilities = [
            ],
            newCapabilities = [
            ];
        for (let i in deprecatedCapabilities) {
            let deprecatedCapability = deprecatedCapabilities[i];

            if (this.hasCapability(deprecatedCapability)) {
                await this.removeCapability(deprecatedCapability);
            }
        }
        for (let i in newCapabilities) {
            let newCapability = newCapabilities[i];
            if (!this.hasCapability(newCapability)) {
                await this.addCapability(newCapability);
            }
        }
    }

    // Device update (polling) Yamaha => Homey ========================================================================================================
    async _updateDevice(){
        this.log("_updateDevice() ID: "+this.getData().id+' Name: '+this.getName());
        if (!this._yamaha){
            this.setUnavailable(this.homey.__("error.device_unavailable"));
        }
        let deviceInfo = {};
        try{
           deviceInfo = await this._yamaha.getDeviceInfo();
           this.setAvailable();
        }
        catch(error){
            this.setUnavailable(this.homey.__("error.device_unavailable"));
        }

        // Device status
        let status = await this._yamaha.getStatus();
        // this.log(status);
        // Store technical range settings
        this._deviceState.maxVol = status.max_volume;
        // onoff
        await this.setCapabilityValue("onoff", (status.power == 'on') ).catch(error => this.log("_updateDevice() capability error: ", error));
        // volume
        let volume = (status.volume - this._deviceState.minVol) / (this._deviceState.maxVol - this._deviceState.minVol);
        await this.setCapabilityValue("volume_set", volume );
        if (status.mute != undefined){
            await this.setCapabilityValue("volume_mute", status.mute ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        // input
        await this.setCapabilityValue("input", status.input ).catch(error => this.log("_updateDevice() capability error: ", error));
        // surround program
        await this.setCapabilityValue("surround_program", status.sound_program ).catch(error => this.log("_updateDevice() capability error: ", error));
        // direct
        await this.setCapabilityValue("direct", status.direct ).catch(error => this.log("_updateDevice() capability error: ", error));

        // play info
        let source = "netusb";
        switch (this.getCapabilityValue("input")){
            case "tuner":
                source = "tuner"
                break;
            case "cd":
                source = "tuner"
                break;
        }
        let playInfo = await this._yamaha.getPlayInfo(source);
        // this.log(playInfo);
        if (playInfo.artist != undefined){
            await this.setCapabilityValue("speaker_artist", playInfo.artist ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_artist", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        if (playInfo.album != undefined){
            await this.setCapabilityValue("speaker_album", playInfo.album ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_album", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        if (playInfo.track != undefined){
            await this.setCapabilityValue("speaker_track", playInfo.track ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_track", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
        }


        if (playInfo.playback != undefined){
            await this.setCapabilityValue("speaker_playing", (playInfo.playback == "play") ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_playing", false ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        if (playInfo.repeat != undefined){
            switch (playInfo.repeat){
                case "off":
                    await this.setCapabilityValue("speaker_repeat", "none").catch(error => this.log("_updateDevice() capability error: ", error));
                    break;
                case "one":
                    await this.setCapabilityValue("speaker_repeat", "track").catch(error => this.log("_updateDevice() capability error: ", error));
                    break;
                case "all":
                    await this.setCapabilityValue("speaker_repeat", "playlist").catch(error => this.log("_updateDevice() capability error: ", error));
                    break;
                default:
                    await this.setCapabilityValue("speaker_repeat", "none").catch(error => this.log("_updateDevice() capability error: ", error));
            }
        }
        else{
            await this.setCapabilityValue("speaker_repeat", "none" ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        if (playInfo.shuffle != undefined){
            await this.setCapabilityValue("speaker_shuffle", (playInfo.shuffle == "on") ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_shuffle", false ).catch(error => this.log("_updateDevice() capability error: ", error));
        }

        if (playInfo.albumart_url != undefined){
            if (this.mediaCover != playInfo.albumart_url){
                this.mediaCover = playInfo.albumart_url;
                await this.mediaImage.update();
            }
        }
        else{
            if (this.mediaCover != null){
                this.mediaCover = null;
                await this.mediaImage.update();
            }
        }

    }

    async upateAlbumArtImage(stream){
        try{
            let url = "http://" + this.getSetting("ip") + this.mediaCover;
            let res = await this.homey.app.httpGetStream(url);
            return await res.pipe(stream);
        }
        catch(error){
            this.error("Error updating album art image: ", error.message);
            stream.end();
            throw new Error("Artwork image error");
        }
    }

    // Device actions Homey => Yamaha  ========================================================================================================
    async _onCapability( capabilityValues, capabilityOptions ) {
        this.log("_onCapability(): ", capabilityValues, capabilityOptions);
        let updateDevice = false;

        let source = "netusb";
        switch (this.getCapabilityValue("input")){
            case "tuner":
                source = "tuner"
                break;
            case "cd":
                source = "tuner"
                break;
        }

        if( capabilityValues["onoff"] != undefined){
            if (capabilityValues["onoff"] == true){
                await this._yamaha.powerOn();
            }
            else{
                await this._yamaha.powerOff();
            }
        }
        
        if( capabilityValues["volume_set"] != undefined){
            let volume = capabilityValues["volume_set"] * (this._deviceState.maxVol - this._deviceState.minVol) +  this._deviceState.minVol;
            volume = Math.round(volume);
            await this._yamaha.setVolumeTo(volume);
        }

        if( capabilityValues["volume_up"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set");
            newVolume = newVolume + 0.05;
            if (newVolume > 1){
                newVolume = 1;
            }
            this.setCapabilityValue("volume_set", newVolume);
            this._onCapability({"volume_set": newVolume}, {"volume_set": {}})
        }

        if( capabilityValues["volume_down"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set");
            newVolume = newVolume - 0.05;
            if (newVolume < 0){
                newVolume = 0;
            }
            this.setCapabilityValue("volume_set", newVolume);
            this._onCapability({"volume_set": newVolume}, {"volume_set": {}})
        }

        if( capabilityValues["volume_mute"] != undefined){
            if (capabilityValues["volume_mute"] == true){
                await this._yamaha.muteOn();
            }
            else{
                await this._yamaha.muteOff();
            }
        }

        if( capabilityValues["direct"] != undefined){
            await this._yamaha.setDirect(capabilityValues["direct"]);
        }

        if( capabilityValues["input"] != undefined){
            await this._yamaha.setInput(capabilityValues["input"]);
        }

        if( capabilityValues["surround_program"] != undefined){
            await this._yamaha.setSound(capabilityValues["surround_program"]);
        }

        if( capabilityValues["speaker_repeat"] != undefined){
            await this._yamaha.toggleRepeat(source);
            updateDevice = true;
        }
        if( capabilityValues["speaker_shuffle"] != undefined){
            await this._yamaha.toggleRepeat(source);
            updateDevice = true;
        }
        if( capabilityValues["speaker_playing"] != undefined){
            switch (source){
                case "netusb":
                    if (capabilityValues["speaker_playing"]){
                        await this._yamaha.playNet();
                    }
                    else{
                        await this._yamaha.pauseNet();
                    }
                    break;
                case "cd":
                    if (capabilityValues["speaker_playing"]){
                        await this._yamaha.playCD();
                    }
                    else{
                        await this._yamaha.pauseCD();
                    }
                    break;
            }
            updateDevice = true;
        }
        if( capabilityValues["speaker_prev"] != undefined){
            switch (source){
                case "netusb":
                    await this._yamaha.prevNet();
                    break;
                case "cd":
                    await this._yamaha.prevCD();
                    break;
            }
            updateDevice = true;
        }
        if( capabilityValues["speaker_next"] != undefined){
            switch (source){
                case "netusb":
                    await this._yamaha.nextNet();
                    break;
                case "cd":
                    await this._yamaha.nextCD();
                    break;
            }
            updateDevice = true;
        }

        if (updateDevice == true){
            this.homey.setTimeout(() => 
                this._updateDevice(),  1000 );
        }
    }

    // API handling ========================================================================================================
    async _connect(ip = null){
        try{
            if (ip){
                this._yamaha = new YamahaYXC(ip);  
            }
            else{
                this._yamaha = new YamahaYXC(this.getSetting("ip"));  
            }
        }
        catch(error){
            this.error("connect(): ", error.message);
            this._yamaha = null;
        }
    }

    async _startInterval(interval = null, unit = null){
        let scanInterval;
        if (interval != null){
            scanInterval = interval;
        }
        else{
            scanInterval = await this.getSetting('interval');
        }
        let scanIntervalUnit;
        if (unit != null){
            scanIntervalUnit = unit;
        }
        else{
            scanIntervalUnit = await this.getSetting('interval_unit');
        }
        if (scanIntervalUnit == "min"){
            scanInterval = scanInterval * 60;
        }
        this.log('_startInterval() Interval: '+scanInterval, ' sec');
        
        if (this._intervalUpdateDevice){
            this.homey.clearInterval(this._intervalUpdateDevice);
        }
        this._intervalUpdateDevice = this.homey.setInterval(() => 
            this._updateDevice(),  scanInterval * 1000 );

        // Start first update immediately
        this._updateDevice();
    }

    // Device handling ========================================================================================================
    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings where changed: ', newSettings);
        if (changedKeys.indexOf("ip") >= 0 ){
            try{
                let localYamaha = new YamahaYXC(newSettings["ip"]); 
                await localYamaha.getDeviceInfo();
                await this._connect(newSettings["ip"]);
            }
            catch(error){
                throw new Error(error.message);
            }
        }

        if (changedKeys.indexOf("interval") >= 0 || changedKeys.indexOf("interval_unit") >= 0){
            // Update device data with a short delay of 1sec
            this._startInterval(newSettings["interval"], newSettings["interval_unit"]);
        }
    }
    
    onAdded() {
        this.log('device added: ', this.getData().id);

    } // end onAdded

    onDeleted() {
        this.log('device deleted:', this.getData().id);
        if (this._intervalUpdateDevice){
            this.homey.clearInterval(this._intervalUpdateDevice);
        }

    } // end onDeleted

    // Helper functions ========================================================================================================


    // Flow actions ========================================================================================================
    async inputSelect(input){
        await this._yamaha.setInput(input);
        await this.setCapabilityValue("input", input ).catch(error => this.log("inputSelect() capability error: ", error));
    }
    async surroundProgramSelect(surroundProgram){
        await this._yamaha.setSound(surroundProgram);
        await this.setCapabilityValue("surround_program", surroundProgram ).catch(error => this.log("surroundProgramSelect() capability error: ", error));
    }
    async directSet(direct){
        await this._yamaha.setDirect(direct);
        await this.setCapabilityValue("direct", direct ).catch(error => this.log("directSet() capability error: ", error));
    }
}
module.exports = receiverDevice;