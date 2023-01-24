'use strict';

const Homey = require('homey');
const YamahaYXC = require('yamaha-yxc-nodejs').YamahaYXC;

const CAPABILITY_DEBOUNCE = 500;
const DEFAULT_ZONE = 'main';

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
                "tuner_band",
                "measure_volume",
                "measure_bass",
                "measure_treble"
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
                if (features.zone[i].id == DEFAULT_ZONE){
                    for (let j=0; j<features.zone[i].range_step.length; j++){
                        this._deviceState.range_step[features.zone[i].range_step[j].id] = features.zone[i].range_step[j];
                    }
                }
            }
            if (this._deviceState.range_step.tone_control != undefined){
                if (!this.hasCapability("bass_set")){
                    await this.addCapability("bass_set");
                    await this.setCapabilityOptions("bass_set", {
                        min: this._deviceState.range_step.tone_control.min,
                        max: this._deviceState.range_step.tone_control.max,
                        step: this._deviceState.range_step.tone_control.step
                    })
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
            }
        }
        catch(error){this.log("_checkFeatures() Error checking tone control: ", this._deviceState.range_step.tone_control)}
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
        // numeric volume (like on the display)
        if (status.actual_volume != undefined && status.actual_volume.value != undefined){
            await this.setCapabilityValue("measure_volume", status.actual_volume.value );
        }
        else{
            await this.setCapabilityValue("measure_volume", volume );
        }

        if (status.mute != undefined){
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
        let hasPlayInfo = false;
        let playInfo = {};
        // let source = "netusb";
        // switch (this.getCapabilityValue("input")){
        //     case "tuner":
        //         source = "tuner"
        //         break;
        //     case "cd":
        //         source = "cd"
        //         break;
        // }
        // let playInfo = await this._yamaha.getPlayInfo(source);
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

                // Tuner band
                if (playInfo.band != undefined){
                    await this.setCapabilityValue("tuner_band", playInfo.band ).catch(
                        //error => this.log("_updateDevice() capability error: ", error)
                        );
                }
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
            // this.log("_updateDevice() Error update playInfo: ", error.message)
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
        let updateDevice = 0;

        let input = this.getCapabilityValue("input");
        let source = "netusb";
        switch (input){
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
            updateDevice = 1;
        }

        if( capabilityValues["volume_up"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set");
            newVolume = newVolume + 0.025;
            if (newVolume > 1){
                newVolume = 1;
            }
            this.setCapabilityValue("volume_set", newVolume);
            this._onCapability({"volume_set": newVolume}, {"volume_set": {}})
        }

        if( capabilityValues["volume_down"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set");
            newVolume = newVolume - 0.025;
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

        if( capabilityValues["bass_set"] != undefined){
            await this._yamaha.setBassTo(capabilityValues["bass_set"]);
            updateDevice = 1;
        }

        if( capabilityValues["treble_set"] != undefined){
            await this._yamaha.setTrebleTo(capabilityValues["treble_set"]);
            updateDevice = 1;
        }

        if( capabilityValues["input"] != undefined){
            await this._yamaha.setInput(capabilityValues["input"]);
            updateDevice = 2;
        }

        if( capabilityValues["surround_program"] != undefined){
            await this._yamaha.setSound(capabilityValues["surround_program"]);
            updateDevice = 1;
        }

        if( capabilityValues["tuner_band"] != undefined){
            await this._yamaha.setBand(capabilityValues["tuner_band"]);
            updateDevice = 1;
        }

        if( capabilityValues["speaker_repeat"] != undefined){
            await this._yamaha.toggleRepeat(source);
            updateDevice = 1;
        }
        if( capabilityValues["speaker_shuffle"] != undefined){
            await this._yamaha.toggleRepeat(source);
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
                        this.selectNetRadioPresetPrev();
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
                        this.selectNetRadioPresetNext();
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
        return await this._yamaha.getStatus();
    }
    async getDevicePlayInfo(){
        return {
            netusb: await this._yamaha.getPlayInfo('netusb'),
            tuner: await this._yamaha.getPlayInfo('tuner'),
            cd: await this._yamaha.getPlayInfo('cd')
        }
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

    async selectNetRadioPreset(item){
        await this._yamaha.recallPreset(item);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async selectNetRadioPresetNext(){
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
        await this._yamaha.SendGetToDevice('/tuner/recallPreset?zone='+DEFAULT_ZONE+'&band='+band+'&num='+item);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async selectTunerPresetNext(){
        await this._yamaha.switchPresetTuner('next');
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async selectTunerPresetPrev(){
        await this._yamaha.switchPresetTuner('previous');
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async tunerBandSelect(band){
        await this._yamaha.setBand(band);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async bassSet(bass_set){
        await this._yamaha.setBassTo(bass_set);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async trebleSet(treble_set){
        await this._yamaha.setTrebleTo(treble_set);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }

    async sendRcCode(code){
        await this._yamaha.SendGetToDevice('/system/sendIrCode?code='+code);
    }
    async sendApiRequest(request){
        await this._yamaha.SendGetToDevice(request);
    }
    

}
module.exports = receiverDevice;