'use strict';

const Homey = require('homey');
const YamahaYXC = require('yamaha-yxc-nodejs').YamahaYXC;

const CAPABILITY_DEBOUNCE = 500;

class receiverDevice extends Homey.Device {

    // Device init ========================================================================================================
    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id);

        await this._fixCapabilities();
        // device attributes
        this._intervalUpdateDevice = null;
        this._yamaha = null;
        this._deviceState = {
            minVol: 0,
            maxVol: 100
        }
        this._mediaCover = "";
        this._mediaImage = await this.homey.images.createImage();
        this._mediaImage.setStream(async (stream) => {
            return await this._upateAlbumArtImage(stream);
        });
        await this.setAlbumArtImage(this._mediaImage);

        await this._connect();
        await this._checkFeatures();

        this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
            await this._onCapability( capabilityValues, capabilityOptions);
        }, CAPABILITY_DEBOUNCE);

        await this._startInterval();
    } // end onInit

    async _fixCapabilities() {
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

    async _checkFeatures(){
        let features = await this._yamaha.getFeatures();
        if (features && features.zone && features.zone[0] && features.zone[0].func_list ){
            let funct = features.zone[0].func_list;
            if (funct.indexOf("direct") == -1 && this.hasCapability("direct")){
                this.removeCapability("direct");
            }
            if (funct.indexOf("direct") > -1 && !this.hasCapability("direct")){
                this.addCapability("direct");
            }
            if (funct.indexOf("enhancer") == -1 && this.hasCapability("enhancer")){
                this.removeCapability("enhancer");
            }
            if (funct.indexOf("enhancer") > -1 && !this.hasCapability("enhancer")){
                this.addCapability("enhancer");
            }
            if (funct.indexOf("bass_extension") == -1 && this.hasCapability("bass")){
                this.removeCapability("bass");
            }
            if (funct.indexOf("bass_extension") > -1 && !this.hasCapability("bass")){
                this.addCapability("bass");
            }
        }
    }

    // Device update (polling) Yamaha => Homey ========================================================================================================
    async _updateDevice(){
        // this.log("_updateDevice() ID: "+this.getData().id+' Name: '+this.getName());
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
        if (status.direct != undefined && this.hasCapability("direct")){
            await this.setCapabilityValue("direct", status.direct ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        // enhancer
        if (status.enhancer != undefined && this.hasCapability("enhancer")){
            await this.setCapabilityValue("enhancer", status.enhancer ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        // bass_extension, set only if provided by API
        if (status.bass_extension != undefined && this.hasCapability("bass")){
            await this.setCapabilityValue("bass", status.bass_extension ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        // play info
        let source = "netusb";
        switch (this.getCapabilityValue("input")){
            case "tuner":
                source = "tuner"
                break;
            case "cd":
                source = "cd"
                break;
        }
        let playInfo = await this._yamaha.getPlayInfo(source);
        // this.log(playInfo);
        if (status.power == 'on' && playInfo.artist != undefined){
            await this.setCapabilityValue("speaker_artist", playInfo.artist ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_artist", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        if (status.power == 'on' && playInfo.album != undefined){
            await this.setCapabilityValue("speaker_album", playInfo.album ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_album", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        if (status.power == 'on' && playInfo.track != undefined){
            await this.setCapabilityValue("speaker_track", playInfo.track ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_track", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
        }


        if (status.power == 'on' && playInfo.playback != undefined){
            await this.setCapabilityValue("speaker_playing", (playInfo.playback == "play") ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_playing", false ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        if (status.power == 'on' && playInfo.repeat != undefined){
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
        if (status.power == 'on' && playInfo.shuffle != undefined){
            await this.setCapabilityValue("speaker_shuffle", (playInfo.shuffle == "on") ).catch(error => this.log("_updateDevice() capability error: ", error));
        }
        else{
            await this.setCapabilityValue("speaker_shuffle", false ).catch(error => this.log("_updateDevice() capability error: ", error));
        }

        if (status.power == 'on' && playInfo.albumart_url != undefined){
            if (this._mediaCover != playInfo.albumart_url){
                this._mediaCover = playInfo.albumart_url;
                await this._mediaImage.update();
            }
        }
        else{
            if (this._mediaCover != ""){
                this._mediaCover = "";
                await this._mediaImage.update();
            }
        }

    }

    async _upateAlbumArtImage(stream){
        try{
            let url = "http://" + this.getSetting("ip") + this._mediaCover;
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
                source = "cd"
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

        if( capabilityValues["enhancer"] != undefined){
            await this._yamaha.setEnhancer(capabilityValues["enhancer"]);
        }

        if( capabilityValues["bass"] != undefined){
            await this._yamaha.setBassExtension(capabilityValues["bass"]);
        }

        if( capabilityValues["input"] != undefined){
            await this._yamaha.setInput(capabilityValues["input"]);
            updateDevice = true;
        }

        if( capabilityValues["surround_program"] != undefined){
            await this._yamaha.setSound(capabilityValues["surround_program"]);
            updateDevice = true;
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
                this._updateDevice(),  500 );
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
        if (this.hasCapability("direct")){
            await this._yamaha.setDirect(direct);
            await this.setCapabilityValue("direct", direct ).catch(error => this.log("directSet() capability error: ", error));
        }
    }
    async enhancerSet(enhancer){
        if (this.hasCapability("enhancer")){
            await this._yamaha.setEnhancer(enhancer);
            await this.setCapabilityValue("enhancer", enhancer ).catch(error => this.log("enhancerSet() capability error: ", error));
        }
    }
    async bassSet(bass){
        if (this.hasCapability("bass")){
            await this._yamaha.setBassExtension(bass);
            await this.setCapabilityValue("bass", bass ).catch(error => this.log("bassSet() capability error: ", error));
        }
    }
    async selectNetRadioPreset(item){
        await this._yamaha.recallPreset(item);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async sendRcCode(code){
        await this._yamaha.SendGetToDevice('/system/sendIrCode?code='+code);
    }

    

}
module.exports = receiverDevice;