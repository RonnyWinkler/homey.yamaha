'use strict';

const Homey = require('homey');

// const SurroundProgramTranslate = {
//     'Action Game': 'ACTION_GAME',
//     'Roleplaying Game': 'ROLEPLAYING_GAME',
//     'Music Video': 'MUSIC_VIDEO',
//     'Standard': 'STANDARD',
//     'Spectacle': 'SPECTACLE',
//     'Sci-Fi': 'SCI-FI',
//     'Adventure': 'ADVENTURE',
//     'Drama': 'DRAMA',
//     'Hall in Munich': 'HALL_IN_MUNICH',
//     'Hall in Vienna': 'HALL_IN_VIENNA',
//     'Chamber': 'CHAMBER',
//     'Cellar Club': 'CELLAR_CLUB',
//     'Church in Royaumont': 'CHURCH_IN_RAYAUMONT',
//     'The Roxy Theatre': 'THE_ROXY_THEATRE',
//     'The Bottom Line': 'THE_BOTTOM_LINE',
//     'Sports': 'SPORTS',
//     'Enhanced': 'ENHANCED',
//     'Mono Movie': 'MONO_MOVIE',
//     '2ch Stereo': '2CH_STEREO',
//     '5ch Stereo': '5CH_STEREO',
//     '7ch Stereo': '7CH_STEREO',
//     '9ch Stereo': '9CH_STEREO',
//     'Surround Decoder': 'SURROUND_DECODER'
// };

const CAPABILITY_DEBOUNCE = 500;

class receiverDevice extends Homey.Device {

    // Device init ========================================================================================================
    async onInit() {
        this.log('Device init: '+this.getName()+' ID: '+this.getData().id);

        await this._fixCapabilities();
        // device attributes
        this._intervalUpdateDevice = null;
        this._yamaha = null;
        this._zone = "Main_Zone";
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
        // await this._checkFeatures();

        this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
            await this._onCapability( capabilityValues, capabilityOptions);
        }, CAPABILITY_DEBOUNCE);

        await this._startInterval();

        // this._yamaha2 = new (require("../../lib/yamaha_av"))(this.getSetting("ip"));

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

    // async _checkFeatures(){
    //     let features = await this._yamaha.getFeatures();
    //     if (features && features.zone && features.zone[0] && features.zone[0].func_list ){
    //         let funct = features.zone[0].func_list;
    //         if (funct.indexOf("direct") == -1 && this.hasCapability("direct")){
    //             this.removeCapability("direct");
    //         }
    //         if (funct.indexOf("direct") > -1 && !this.hasCapability("direct")){
    //             this.addCapability("direct");
    //         }
    //         if (funct.indexOf("enhancer") == -1 && this.hasCapability("enhancer")){
    //             this.removeCapability("enhancer");
    //         }
    //         if (funct.indexOf("enhancer") > -1 && !this.hasCapability("enhancer")){
    //             this.addCapability("enhancer");
    //         }
    //         if (funct.indexOf("bass_extension") == -1 && this.hasCapability("bass")){
    //             this.removeCapability("bass");
    //         }
    //         if (funct.indexOf("bass_extension") > -1 && !this.hasCapability("bass")){
    //             this.addCapability("bass");
    //         }
    //     }
    // }

    // Device update (polling) Yamaha => Homey ========================================================================================================
    async _updateDevice(){
        // this.log("_updateDevice() ID: "+this.getData().id+' Name: '+this.getName());
        if (!this._yamaha){
            this.setUnavailable(this.homey.__("error.device_unavailable"));
            return;
        }
        let basicStatus = {};
        try{
            basicStatus = await this._yamaha.getBasicStatus();
            this.setAvailable();
        }
        catch(error){
            this.setUnavailable(this.homey.__("error.device_unavailable"));
            return;
        }

        // Device status
        // onoff
        let isOn = false;
        try{
            isOn = await this._yamaha.isOn(true);
            await this.setCapabilityValue("onoff", isOn ).catch(error => this.log("_updateDevice() capability error: ", error.message));
        } catch(error){ this.log("_updateDevice() Error update onoff: ", error.message)}

        // volume
        try{
            let volume = ( await this._yamaha.getVolume(true) ) /100;
            if (volume<0){
                volume = 0;
            }
            if (volume>1){
                volume = 1;
            }
            await this.setCapabilityValue("volume_set", volume ).catch(error => this.log("_updateDevice() capability error: ", error.message));
        } catch(error){ this.log("_updateDevice() Error update volume: ", error.message)}
        
        // muted
        try{
            let isMuted = await this._yamaha.isMuted(true);
            await this.setCapabilityValue("volume_mute", isMuted ).catch(error => this.log("_updateDevice() capability error: ", error));
        } catch(error){ this.log("_updateDevice() Error update muted: ", error.message)}
        
        // input
        try{
            let input = await this._yamaha.getCurrentInput(true);
            await this.setCapabilityValue("input_av", input ).catch(error => this.log("_updateDevice() capability error: ", error));
        } catch(error){ this.log("_updateDevice() Error update input: ", error.message)}
       
        // surround_program
        try{
            let surround_program = await this._yamaha.getCurrentSurroundProgram();
            await this.setCapabilityValue("surround_program_av", surround_program ).catch(error => this.log("_updateDevice() capability error: ", error));
        } catch(error){ this.log("_updateDevice() Error update input: ", error.message)}

        // direct
        try{
            let direct = await this._yamaha.isDirectEnabled();
            await this.setCapabilityValue("direct", direct ).catch(error => this.log("_updateDevice() capability error: ", error));
        } catch(error){ this.log("_updateDevice() Error update direct: ", error.message)}
        
        // enhancer
        try{
            let enhancer = await this._yamaha.isEnhancerEnabled();
            await this.setCapabilityValue("enhancer", enhancer ).catch(error => this.log("_updateDevice() capability error: ", error));
        } catch(error){ this.log("_updateDevice() Error update enhancer: ", error.message)}

        // bass
        try{
            let bass = await this._yamaha.isExtraBassEnabled();
            await this.setCapabilityValue("bass", bass ).catch(error => this.log("_updateDevice() capability error: ", error));
        } catch(error){ this.log("_updateDevice() Error update bass: ", error.message)}
        
        // play info
        let hasPlayInfo = false;
        try{
            if (isOn == true){
                let playInfo = await this._yamaha.getPlayInfo(this.getCapabilityValue("input_av"));
                if (playInfo != undefined && playInfo != ''){
                    hasPlayInfo = true;
                    await this.setCapabilityValue("speaker_playing", (playInfo.Play_Info.Playback_Info == 'Play') ).catch(error => this.log("_updateDevice() capability error: ", error));
                    if (playInfo.Play_Info.Meta_Info.Station != undefined){
                        await this.setCapabilityValue("speaker_artist", playInfo.Play_Info.Meta_Info.Station ).catch(error => this.log("_updateDevice() capability error: ", error));
                    }
                    else{
                        await this.setCapabilityValue("speaker_artist", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
                    }
                    if (playInfo.Play_Info.Meta_Info.Album != undefined){
                        await this.setCapabilityValue("speaker_album", playInfo.Play_Info.Meta_Info.Album ).catch(error => this.log("_updateDevice() capability error: ", error));
                    }
                    else{
                        await this.setCapabilityValue("speaker_album", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
                    }
                    if (playInfo.Play_Info.Meta_Info.Song != undefined){
                        await this.setCapabilityValue("speaker_track", playInfo.Play_Info.Meta_Info.Song ).catch(error => this.log("_updateDevice() capability error: ", error));
                    }
                    else{
                        await this.setCapabilityValue("speaker_track", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
                    }
                    if (playInfo.Play_Info.Album_ART.URL != undefined){
                        if (this._mediaCover != playInfo.Play_Info.Album_ART.URL){
                            this._mediaCover = playInfo.Play_Info.Album_ART.URL;
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
        } catch(error){ 
            // this.log("_updateDevice() Error update playInfo: ", error.message)
        }
        if (!hasPlayInfo){
            await this.setCapabilityValue("speaker_artist", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_album", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_track", "" ).catch(error => this.log("_updateDevice() capability error: ", error));
            await this.setCapabilityValue("speaker_playing", false ).catch(error => this.log("_updateDevice() capability error: ", error));

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

        if( capabilityValues["onoff"] != undefined){
            await this._yamaha.setPower(capabilityValues["onoff"]);
        }
        
        if( capabilityValues["volume_set"] != undefined){
            await this._yamaha.setVolume(capabilityValues["volume_set"] * 100);
        }

        if( capabilityValues["volume_up"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set") + 0.05;
            if (newVolume > 1){
                newVolume = 1;
            }
            this.setCapabilityValue("volume_set", newVolume);
            await this._yamaha.setVolume(newVolume * 100);
        }

        if( capabilityValues["volume_down"] != undefined){
            let newVolume = this.getCapabilityValue("volume_set") - 0.05;
            if (newVolume < 0){
                newVolume = 0;
            }
            this.setCapabilityValue("volume_set", newVolume);
            await this._yamaha.setVolume(newVolume * 100);
        }

        if( capabilityValues["volume_mute"] != undefined){
            await this._yamaha.setMute(capabilityValues["volume_mute"]);
        }

        if( capabilityValues["direct"] != undefined){
            await this._yamaha.setDirect(capabilityValues["direct"]);
        }

        if( capabilityValues["enhancer"] != undefined){
            await this._yamaha.setEnhancer(capabilityValues["enhancer"]);
        }

        if( capabilityValues["bass"] != undefined){
            await this._yamaha.setExtraBass(capabilityValues["bass"]);
        }

        if( capabilityValues["input_av"] != undefined){
            await this._yamaha.setInput(capabilityValues["input_av"]);
            updateDevice = true;
        }

        if( capabilityValues["surround_program_av"] != undefined){
            await this._yamaha.setSurroundProgram(capabilityValues["surround_program_av"]);
            updateDevice = true;
        }
        if( capabilityValues["speaker_playing"] != undefined){
            if (capabilityValues["speaker_playing"]){
                await this._yamaha.play();
            }
            else{
                await this._yamaha.pause();
            }
            updateDevice = true;
        }
        if( capabilityValues["speaker_prev"] != undefined){
            await this._yamaha.prev();
            updateDevice = true;
        }
        if( capabilityValues["speaker_next"] != undefined){
            await this._yamaha.next();
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
                // this._yamaha = new (require("../../lib/yamaha-nodejs"))(ip);  
                this._yamaha = new (require("../../lib/yamaha_av"))(ip);
            }
            else{
                // this._yamaha = new (require("../../lib/yamaha-nodejs"))(this.getSetting("ip"));  
                this._yamaha = new (require("../../lib/yamaha_av"))(this.getSetting("ip"));  
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
                let localYamaha =  new (require("../../lib/yamaha-nodejs"))(newSettings["ip"]); 
                await localYamaha.getBasicInfo();
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
        await this.setCapabilityValue("input_av", input ).catch(error => this.log("inputSelect() capability error: ", error));
    }
    async surroundProgramSelect(surroundProgram){
        await this._yamaha.setSurroundProgram(surroundProgram);
        await this.setCapabilityValue("surround_program_av", surroundProgram ).catch(error => this.log("surroundProgramSelect() capability error: ", error));
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
            await this._yamaha.setExtraBass(bass);
            await this.setCapabilityValue("bass", bass ).catch(error => this.log("bassSet() capability error: ", error));
        }
    }
    // async selectNetRadioListItem(item){
    //     await this._yamaha.selectNetRadioListItem(item);
    //     this.homey.setTimeout(() => 
    //         this._updateDevice(),  500 );
    // }
    async selectNetRadioPreset(item){
        await this._yamaha.selectNetRadioPreset(item);
        this.homey.setTimeout(() => 
            this._updateDevice(),  500 );
    }
    async sendRcCode(code){
        await this._yamaha.sendRcCode(code);
    }

}
module.exports = receiverDevice;