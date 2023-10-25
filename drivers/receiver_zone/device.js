'use strict';

const Homey = require('homey');

const CAPABILITY_DEBOUNCE = 500;

const PLAY_SOURCE = {
    'tuner': 'tuner',
    'cd': 'cd',
    'net_radio': 'netusb',
    'bluetooth': 'netusb',
    'usb': 'netusb',
    'usb_dac': 'netusb',
    'server': 'netusb',
    'pandora': 'netusb',
    'spotify': 'netusb',
    'airplay': 'netusb',
    'napster': 'netusb',
    'juke': 'netusb',
    'qobuz': 'netusb',
    'tidal': 'netusb',
    'deezer': 'netusb',
    'mc_link': 'netusb'
};


class receiverZoneDevice extends Homey.Device {

    // Device init ========================================================================================================
    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id + '/' + this.getData().zone);

        await this._fixCapabilities();

    } // end onInit

    async initDevice(api){
        this.log('Zone init: '+this.getName()+' ID: '+this.getData().id);
        // device attributes
        try{
            this._yamaha = api;
        }
        catch(error){
            this.setUnavailable(this.homey.__("error.zone_unavailable"));
            this.log("_updateDevice() Error getting parent receiver. Set device unavailable.");
        }

        this._zone = this.getData().zone; 
        switch (this._zone){
            case "zone2":
                this._zoneId = 1;
                break;
            case "zone3":
                this._zoneId = 2;
                break;
            case "zone4":
                this._zoneId = 3;
                break;
        }

        this._deviceState = {
            minVol: 0,
            maxVol: 100,
            range_step: {}
        }
        this._input_list = this.homey.app.manifest.capabilities.input.values;
        this._mediaCover = "";
        this._mediaImage = await this.homey.images.createImage();
        this._mediaImage.setStream(async (stream) => {
            return await this._upateAlbumArtImage(stream);
        });
        await this.setAlbumArtImage(this._mediaImage);

        await this._checkFeatures();

        this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
            try{
                await this._onCapability( capabilityValues, capabilityOptions);
            }
            catch(error){
                this.log("_onCapability() Error: ",error);
            }
        }, CAPABILITY_DEBOUNCE);
        
    }

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


    _getParentDevice(){
        let receivers = this.homey.drivers.getDriver('receiver').getDevices();
        for (let i=0; i<receivers.length; i++){
            if (receivers[i].getData().id == this.getData().id){
                return receivers[i];
            }
        }
        throw new Error("No parent device found");
    }

    async _checkFeatures(){
        let features = {};
        try{
            features = await this._yamaha.getFeatures();
        }
        catch(error){
            this.log("_checkFeatures() Error reading device features.", error.message);
            return;
        }
        // System features
        if (features && features.system && features.system.func_list ){
            let funct = features.system.func_list;
            if (funct.indexOf("party_mode") == -1 && this.hasCapability("party")){
               await  this.removeCapability("party");
            }
            if (funct.indexOf("party_mode") > -1 && !this.hasCapability("party")){
                this.addCapability("party");
            }
        }
        // Zone features
        if (features && features.zone && features.zone[this._zoneId] && features.zone[this._zoneId].func_list ){
            let funct = features.zone[this._zoneId].func_list;
            if (funct.indexOf("power") == -1 && this.hasCapability("onoff")){
                await  this.removeCapability("onoff");
            }
            if (funct.indexOf("power") > -1 && !this.hasCapability("onoff")){
                 this.addCapability("onoff");
            }
            if (funct.indexOf("volume") == -1 && this.hasCapability("volume_set")){
                await  this.removeCapability("volume_set");
            }
            if (funct.indexOf("volume") > -1 && !this.hasCapability("volume_set")){
                 this.addCapability("volume_set");
            }
            if (funct.indexOf("actual_volume") == -1 && this.hasCapability("measure_volume")){
                await  this.removeCapability("measure_volume");
            }
            if (funct.indexOf("actual_volume") > -1 && !this.hasCapability("measure_volume")){
                 this.addCapability("measure_volume");
            }
            if (funct.indexOf("sound_program") == -1 && this.hasCapability("surround_program")){
                await  this.removeCapability("surround_program");
            }
            if (funct.indexOf("sound_program") > -1 && !this.hasCapability("surround_program")){
                 this.addCapability("surround_program");
            }
            if (funct.indexOf("direct") == -1 && this.hasCapability("direct")){
               await  this.removeCapability("direct");
            }
            if (funct.indexOf("direct") > -1 && !this.hasCapability("direct")){
                this.addCapability("direct");
            }
            if (funct.indexOf("enhancer") == -1 && this.hasCapability("enhancer")){
                await this.removeCapability("enhancer");
            }
            if (funct.indexOf("enhancer") > -1 && !this.hasCapability("enhancer")){
                await this.addCapability("enhancer");
            }
            if (funct.indexOf("bass_extension") == -1 && this.hasCapability("bass")){
                await this.removeCapability("bass");
            }
            if (funct.indexOf("bass_extension") > -1 && !this.hasCapability("bass")){
                await this.addCapability("bass");
            }
        }
        // Get volume range
        try{
            this._deviceState['range_step'] = {};
            for (let i=0; i<features.zone.length; i++){
                if (features.zone[i].id == this._zone){
                    for (let j=0; j<features.zone[i].range_step.length; j++){
                        this._deviceState.range_step[features.zone[i].range_step[j].id] = features.zone[i].range_step[j];
                    }
                }
            }
            if (this._deviceState.range_step.tone_control != undefined){
                if (!this.hasCapability("measure_bass")){
                    await this.addCapability("measure_bass");
                }
                if (!this.hasCapability("bass_set")){
                    await this.addCapability("bass_set");
                    await this.setCapabilityOptions("bass_set", {
                        min: this._deviceState.range_step.tone_control.min,
                        max: this._deviceState.range_step.tone_control.max,
                        step: this._deviceState.range_step.tone_control.step
                    })
                }
                if (!this.hasCapability("measure_treble")){
                    await this.addCapability("measure_treble");
                }
                if (!this.hasCapability("treble_set")){
                    await this.addCapability("treble_set");
                    await this.setCapabilityOptions("treble_set", {
                        min: this._deviceState.range_step.tone_control.min,
                        max: this._deviceState.range_step.tone_control.max,
                        step: this._deviceState.range_step.tone_control.step
                    })
                }
            }
            if (this._deviceState.range_step.tone_control == undefined){
                if (this.hasCapability("bass_set")){
                    await this.removeCapability("bass_set");
                }
                if (this.hasCapability("treble_set")){
                    await this.removeCapability("treble_set");
                }
                if (this.hasCapability("measure_bass")){
                    await this.removeCapability("measure_bass");
                }
                if (this.hasCapability("measure_treble")){
                    await this.removeCapability("measure_treble");
                }
            }
        }
        catch(error){this.log("_checkFeatures() Error checking tone control: ", this._deviceState.range_step.tone_control)}
    }

    // Device update (polling) Yamaha => Homey ========================================================================================================
    async _updateDevice(){
        // this.log("_updateDevice() ID: "+this.getData().id+' Name: '+this.getName());
        if (!this._yamaha){
            this.setUnavailable(this.homey.__("error.zone_unavailable"));
            this.log("_updateDevice() Error checking Yamaha API. Set device unavailable.");
            return;
        }
        let deviceInfo = {};
        try{
           deviceInfo = await this._yamaha.getDeviceInfo();
           this.setAvailable();
        }
        catch(error){
            this.setUnavailable(this.homey.__("error.zone_unavailable"));
            this.log("_updateDevice() Error reading device info from API. Set device unavailable.");
            return;
        }

        let status = {};
        try{
            // Device status
            status = await this._yamaha.getStatus(this._zone);
            // this.log(status);
            // Store technical range settings
            this._deviceState.maxVol = status.max_volume;
            // onoff
            if (this.hasCapability("onoff")){
                await this.setCapabilityValue("onoff", (status.power == 'on') ).catch(error => this.log("_updateDevice() capability error: ", error));
            }
            // volume
            if (this.hasCapability("volume_set")){
                let volume = (status.volume - this._deviceState.minVol) / (this._deviceState.maxVol - this._deviceState.minVol);
                await this.setCapabilityValue("volume_set", volume );
            }
            // numeric volume (like on the display)
            if (this.hasCapability("measure_volume")){
                if (status.actual_volume != undefined && status.actual_volume.value != undefined){
                    await this.setCapabilityValue("measure_volume", status.actual_volume.value );
                }
                else{
                    await this.setCapabilityValue("measure_volume", volume );
                }
            }

            if (status.mute != undefined && this.hasCapability("volume_mute")){
                await this.setCapabilityValue("volume_mute", status.mute ).catch(error => this.log("_updateDevice() capability error: ", error));
            }
            // bass slider
            if (this.hasCapability("bass_set")){
                if (    status.tone_control != undefined 
                        && status.tone_control.bass != undefined
                        && this._deviceState.range_step.tone_control != undefined){
                    await this.setCapabilityValue("bass_set", status.tone_control.bass );
                    await this.setCapabilityValue("measure_bass", status.tone_control.bass );
                }
                else{            
                    await this.setCapabilityValue("bass_set", 0 );
                    await this.setCapabilityValue("measure_bass", 0 );
                }
            }
            // treble slider
            if (this.hasCapability("treble_set")){
                if (    status.tone_control != undefined 
                        && status.tone_control.treble != undefined
                        && this._deviceState.range_step.tone_control != undefined){
                    await this.setCapabilityValue("treble_set", status.tone_control.treble );
                    await this.setCapabilityValue("measure_treble", status.tone_control.treble );
                }
                else{
                    await this.setCapabilityValue("treble_set", 0 );
                    await this.setCapabilityValue("measure_treble", 0 );
                }
            }

            // input
            if (status.input != undefined && this.hasCapability("input")){
                await this.setCapabilityValue("input", status.input ).catch(error => this.log("_updateDevice() capability error: ", error));
            }
            // surround program
            if (status.sound_program != undefined && this.hasCapability("sound_program")){
                await this.setCapabilityValue("surround_program", status.sound_program ).catch(error => this.log("_updateDevice() capability error: ", error));
            }
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
            // party mode
            if (status.party_enable != undefined && this.hasCapability("party")){
                await this.setCapabilityValue("party", status.party_enable ).catch(error => this.log("_updateDevice() capability error: ", error));
            }
        }
        catch(error){
            this.log("_updateDevice() Error reading device status: ", error.message);
        }

        // play info
        let hasPlayInfo = false;
        let playInfo = {};
        try{
            if (status.power == 'on'){
                switch (this.getCapabilityValue("input")){
                    case 'net_radio':
                    case 'bluetooth':
                    case 'usb':
                    case 'usb_dac':
                    case 'server':
                        // play info including artist, track, album
                        playInfo = await this._getPlayInfoNet();
                        break;
                    case 'tuner':
                        // play info including band, frequency
                        playInfo = await this._getPlayInfoTuner();
                        break;
                    case 'cd':
                        // play info including artist, track, album, time
                        playInfo = await this._getPlayInfoCd();
                        break;
                    default:
                        // play info including input name
                        playInfo = {
                            artist:  this._input_list.find(input => input.id == this.getCapabilityValue("input")).title['en']
                        }
                }
                hasPlayInfo = true;
                // this.log(playInfo);

                // // Tuner band
                // if (playInfo.band != undefined && this.hasCapability("tuner_band")){
                //     await this.setCapabilityValue("tuner_band", playInfo.band ).catch(
                //         //error => this.log("_updateDevice() capability error: ", error)
                //         );
                // }
                // Artist, album, track
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
                // position, duration
                if (playInfo.play_time != undefined){
                    await this.setCapabilityValue("speaker_position", playInfo.play_time ).catch(error => this.log("_updateDevice() capability error: ", error));
                }
                else{
                    await this.setCapabilityValue("speaker_position", 0 ).catch(error => this.log("_updateDevice() capability error: ", error));
                }
                if (playInfo.total_time != undefined){
                    await this.setCapabilityValue("speaker_duration", playInfo.total_time ).catch(error => this.log("_updateDevice() capability error: ", error));
                }
                else{
                    await this.setCapabilityValue("speaker_duration", 0 ).catch(error => this.log("_updateDevice() capability error: ", error));
                }
                // play state
                if (playInfo.playback != undefined){
                    await this.setCapabilityValue("speaker_playing", (playInfo.playback == "play") ).catch(error => this.log("_updateDevice() capability error: ", error));
                }
                else{
                    await this.setCapabilityValue("speaker_playing", false ).catch(error => this.log("_updateDevice() capability error: ", error));
                }
                // repeat, shuffle
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
                // album art
                if (playInfo.albumart_url != undefined){
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
        }
        catch(error){
            this.log("_updateDevice() Error update playInfo: ", error.message)
        }
        if (!hasPlayInfo){
            await this.setCapabilityValue("speaker_artist", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_album", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_track", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_playing", false ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_repeat", "none" ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_shuffle", false ).catch(error => this.log("_updateDevice() capability error: ", error));

            if (this._mediaCover != ""){
                this._mediaCover = "";
                await this._mediaImage.update();
            }
        }
    }

    async _upateAlbumArtImage(stream){
        try{
            let ip = this._getParentDevice().getSetting("ip");
            let url = "http://" + ip + this._mediaCover;
            let res = await this.homey.app.httpGetStream(url);
            return await res.pipe(stream);
        }
        catch(error){
            this.log("Error updating album art image: ", error.message);
            stream.end();
            throw new Error("Artwork image error");
        }
    }

    // Device actions Homey => Yamaha  ========================================================================================================
    async _onCapability( capabilityValues, capabilityOptions ) {
        this.log("_onCapability(): ", capabilityValues, capabilityOptions);
        let updateDevice = 0;

        let input = this.getCapabilityValue("input");
        let source = this._getPlaySource(input);

        if( capabilityValues["onoff"] != undefined){
            if (capabilityValues["onoff"] == true){
                await this._yamaha.powerOn(this._zone);
            }
            else{
                await this._yamaha.powerOff(this._zone);
            }
            updateDevice = 1;
        }
        
        if( capabilityValues["volume_set"] != undefined){
            let volume = capabilityValues["volume_set"] * (this._deviceState.maxVol - this._deviceState.minVol) +  this._deviceState.minVol;
            volume = Math.round(volume);
            await this._yamaha.setVolumeTo(volume, this._zone);
            updateDevice = 1;
        }

        if( capabilityValues["volume_up"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set");
            newVolume = newVolume + 0.025;
            if (newVolume > 1){
                newVolume = 1;
            }
            this.setCapabilityValue("volume_set", newVolume);
            await this._onCapability({"volume_set": newVolume}, {"volume_set": {}})
        }

        if( capabilityValues["volume_down"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set");
            newVolume = newVolume - 0.025;
            if (newVolume < 0){
                newVolume = 0;
            }
            this.setCapabilityValue("volume_set", newVolume);
            await this._onCapability({"volume_set": newVolume}, {"volume_set": {}})
        }

        if( capabilityValues["volume_mute"] != undefined){
            if (capabilityValues["volume_mute"] == true){
                await this._yamaha.muteOn(this._zone);
            }
            else{
                await this._yamaha.muteOff(this._zone);
            }
            updateDevice = 1;
        }

        if( capabilityValues["direct"] != undefined){
            await this._yamaha.setDirect(capabilityValues["direct"], this._zone);
            updateDevice = 1;
        }

        if( capabilityValues["enhancer"] != undefined){
            await this._yamaha.setEnhancer(capabilityValues["enhancer"], this._zone);
            updateDevice = 1;
        }

        if( capabilityValues["bass"] != undefined){
            await this._yamaha.setBassExtension(capabilityValues["bass"], this._zone);
            updateDevice = 1;
        }

        if( capabilityValues["party"] != undefined){
            await this._yamaha.setPartyMode(capabilityValues["party"]);
        }

        if( capabilityValues["bass_set"] != undefined){
            await this._yamaha.setBassTo(capabilityValues["bass_set"], this._zone);
            updateDevice = 1;
        }

        if( capabilityValues["treble_set"] != undefined){
            await this._yamaha.setTrebleTo(capabilityValues["treble_set"], this._zone);
            updateDevice = 1;
        }

        if( capabilityValues["input"] != undefined){
            await this._yamaha.setInput(capabilityValues["input"], this._zone);
            updateDevice = 2;
        }

        if( capabilityValues["surround_program"] != undefined){
            await this._yamaha.setSound(capabilityValues["surround_program"], this._zone);
            updateDevice = 1;
        }

        if( capabilityValues["speaker_repeat"] != undefined){
            await this._yamaha.toggleRepeat(source);
            updateDevice = 1;
        }
        if( capabilityValues["speaker_shuffle"] != undefined){
            await this._yamaha.toggleShuffle(source);
            updateDevice = 1;
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
            updateDevice = 1;
        }
        if( capabilityValues["speaker_prev"] != undefined){
            switch (source){
                case "tuner":
                    await this.selectTunerPresetPrev();
                    break;
                case "netusb":
                    if (input == "net_radio"){
                        await this.selectNetRadioPresetPrev();
                    }
                    else{
                        await this._yamaha.prevNet();
                    }
                    break;
                case "cd":
                    await this._yamaha.prevCD();
                    break;
            }
            updateDevice = 1;
        }
        if( capabilityValues["speaker_next"] != undefined){
            switch (source){
                case "tuner":
                    await this.selectTunerPresetNext();
                    break;
                case "netusb":
                    if (input == "net_radio"){
                        await this.selectNetRadioPresetNext();
                    }
                    else{
                        await this._yamaha.nextNet();
                    }
                    break;
                case "cd":
                    await this._yamaha.nextCD();
                    break;
            }
            updateDevice = 1;
        }
        // default devie update to refresh play info
        if (updateDevice == 1){
            this.homey.setTimeout(() => 
                this._updateDevice(),  500 );
        }
        // second update for changes needing more time
        if (updateDevice == 2){
            this.homey.setTimeout(() => 
                this._updateDevice(),  5000 );
        }
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
    // async onSettings({ oldSettings, newSettings, changedKeys }) {
    //     this.log('Settings where changed: ', newSettings);
    //     if (changedKeys.indexOf("ip") >= 0 ){
    //         try{
    //             let localYamaha = new YamahaYXC(newSettings["ip"]); 
    //             await localYamaha.getDeviceInfo();
    //             await this._connect(newSettings["ip"]);
    //         }
    //         catch(error){
    //             throw new Error(error.message);
    //         }
    //     }

    //     if (changedKeys.indexOf("interval") >= 0 || changedKeys.indexOf("interval_unit") >= 0){
    //         // Update device data with a short delay of 1sec
    //         this._startInterval(newSettings["interval"], newSettings["interval_unit"]);
    //     }
    // }
    
    onAdded() {
        this.log('device added: ', this.getData().id);

        try{
            this.initDevice(this._getParentDevice().getApi());
        }
        catch(error){
            this.log("onAdded() Error getting parent receiver API instance.");
        }
    } // end onAdded

    onDeleted() {
        this.log('device deleted:', this.getData().id);

    } // end onDeleted

    // Helper functions ========================================================================================================
    _getPlaySource(input){
        return PLAY_SOURCE[input];
    }
    
    async _getPlayInfoNet(){
        let playInfo = await this._yamaha.getPlayInfo('netusb');
        return {
            artist: playInfo.artist,
            album: playInfo.album,
            track: playInfo.track,
            playback: playInfo.playback,
            repeat: playInfo.repeat,
            shuffle: playInfo.shuffle,
            albumart_url: playInfo.albumart_url
        }
    }

    async _getPlayInfoTuner(){
        let playInfo = await this._yamaha.getPlayInfo('tuner');
        let band = '';
        let preset = '';
        switch (playInfo.band){
            case 'fm':
                band = 'FM';
                if (playInfo.fm.preset != undefined && playInfo.fm.preset != 0){
                    preset = playInfo.fm.preset + ': ';
                }
                preset += playInfo.fm.freq/1000;
                break;
            case 'am':
                band = 'AM';
                if (playInfo.am.preset != undefined && playInfo.am.preset != 0){
                    preset = playInfo.am.preset + ': ';
                }
                preset += playInfo.am.freq/1000;
                break;
            case 'dab':
                band = 'DAB';
                if (playInfo.dab.preset != undefined && playInfo.dab.preset != 0){
                    preset = playInfo.dab.preset + ': ID ';
                }
                preset += playInfo.dab.id + ' ' + playInfo.dab.ch_label;
                break;
        }
        return {
            artist: band,
            track: preset,
            band: playInfo.band
        }
    }
    async _getPlayInfoCd(){
        let playInfo = await this._yamaha.getPlayInfo('cd');
        return {
            artist: playInfo.artist,
            album: playInfo.album,
            track: playInfo.track,
            playback: playInfo.playback,
            repeat: playInfo.repeat,
            shuffle: playInfo.shuffle,
            play_time: playInfo.play_time,
            total_time: playInfo.total_time
        }
        
    }

    // Device access =============================================================================================
    async getDeviceInfo(){
        return await this._yamaha.getDeviceInfo();
    }
    async getDeviceFeatures(){
        return await this._yamaha.getFeatures();
    }
    async getDeviceStatus(){
        return await this._yamaha.getStatus(this._zone);
    }
    async getDevicePlayInfo(){
        return {
            netusb: await this._yamaha.getPlayInfo('netusb'),
            tuner: await this._yamaha.getPlayInfo('tuner'),
            cd: await this._yamaha.getPlayInfo('cd')
        }
    }
    async updateDevice(){
        await this._updateDevice();
    }

    // Flow actions  ========================================================================================================
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
    async partySet(party){
        if (this.hasCapability("party")){
            await this._yamaha.setPartyMode(party);
            await this.setCapabilityValue("party", party ).catch(error => this.log("partySet() capability error: ", error));
        }
    }

    async selectNetRadioPreset(item){
        if (this.getCapabilityValue("input") != 'net_radio'){
            throw new Error("NetRadio input is not active");
        }
        await this._yamaha.recallPreset(item);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async selectNetRadioPresetNext(){
        if (this.getCapabilityValue("input") != 'net_radio'){
            throw new Error("NetRadio input is not active");
        }
        let playInfo = await this._yamaha.getPlayInfo('netusb');
        if (playInfo && playInfo.artist){
            let preset = await this._yamaha.getPresetInfo();  
            if (preset && preset.preset_info){
                preset = preset.preset_info;
                for (let i=0; i<preset.length; i++){
                    if (preset[i].text != '' && preset[i].text == playInfo.artist){
                        if (i<preset.length-1 && preset[i+1].text != ''){
                            this.log('selectNetRadioPresetNext(): Current preset: '+(i+1)+' ('+preset[i].text+') Next preset: '+i+2+' ('+preset[i+1].text+')' );
                            await this._yamaha.recallPreset(i+2);
                            // Preset switch takes really long. Update playInfo 2x
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  1000 );
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  5000 );
                        }
                        else{
                            this.log('selectNetRadioPresetNext(): Current preset: '+(i+1)+' ('+preset[i].text+') Next preset: 1 ('+preset[0].text+')' );
                            await this._yamaha.recallPreset(1);
                            // Preset switch takes really long. Update playInfo 2x
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  1000 );
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  5000 );
                        }
                    }
                }
            }
        }
    }
    async selectNetRadioPresetPrev(){
        if (this.getCapabilityValue("input") != 'net_radio'){
            throw new Error("NetRadio input is not active");
        }
        let playInfo = await this._yamaha.getPlayInfo('netusb');
        if (playInfo && playInfo.artist){
            let preset = await this._yamaha.getPresetInfo();  
            if (preset && preset.preset_info){
                preset = preset.preset_info;
                for (let i=0; i<preset.length; i++){
                    if (preset[i].text != '' && preset[i].text == playInfo.artist){
                        if (i>0 && preset[i-1].text != ''){
                            this.log('selectNetRadioPresetNext(): Current preset: '+(i+1)+' ('+preset[i].text+') Next preset: '+(i)+' ('+preset[i-1].text+')' );
                            await this._yamaha.recallPreset(i);
                            // Preset switch takes really long. Update playInfo 2x
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  1000 );
                            // Preset switch takes really long. Update playInfo 2x
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  5000 );
                        }
                        else{
                            // get last entry
                            let prev = preset.length-1;
                            for (let j=preset.length-1; j>0 && preset[j].text == ''; j--){
                                prev = j;
                            }
                            this.log('selectNetRadioPresetNext(): Current preset: '+(i+1)+' ('+preset[i].text+') Next preset: '+prev+' ('+preset[prev-1].text+')' );
                            await this._yamaha.recallPreset(prev);
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  1000 );
                            this.homey.setTimeout(() => 
                                this._updateDevice(),  5000 );
                        }
                    }
                }
            }
        }
    }

    async selectTunerPreset(item, band){
        if (this.getCapabilityValue("input") != 'tuner'){
            throw new Error("Tuner input is not active");
        }
        await this._yamaha.setTunerPreset(item, band);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async selectTunerPresetNext(){
        if (this.getCapabilityValue("input") != 'tuner'){
            throw new Error("Tuner input is not active");
        }
        await this._yamaha.switchPresetTuner('next');
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async selectTunerPresetPrev(){
        if (this.getCapabilityValue("input") != 'tuner'){
            throw new Error("Tuner input is not active");
        }
        await this._yamaha.switchPresetTuner('previous');
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async tunerBandSelect(band){
        if (this.getCapabilityValue("input") != 'tuner'){
            throw new Error("Tuner input is not active");
        }
        await this._yamaha.setBand(band);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async bassSet(bass_set){
        await this._yamaha.setBassTo(bass_set, this._zone);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async trebleSet(treble_set){
        await this._yamaha.setTrebleTo(treble_set, this._zone);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }

    // async sendRcCode(code){
    //     await this._yamaha.sendIrCode(code);
    // }
    // async sendApiRequest(request){
    //     await this._yamaha.SendGetToDevice(request);
    // }

}
module.exports = receiverZoneDevice;