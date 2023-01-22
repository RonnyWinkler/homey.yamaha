'use strict';

const DEFAULT_ZONE = "Main_Zone";

const http = require('http');
const simpleSSDP = require('simple-ssdp');
const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser");
const parser = new XMLParser();
// const parserOptions = {
//     attributeNamePrefix : "@_",
//     attrNodeName: "attr", //default is 'false'
//     textNodeName : "#text",
//     ignoreAttributes : true,
//     ignoreNameSpace : false,
//     allowBooleanAttributes : false,
//     parseNodeValue : true,
//     parseAttributeValue : false,
//     trimValues: true,
//     cdataTagName: "__cdata", //default is 'false'
//     cdataPositionChar: "\\c",
//     parseTrueNumberOnly: false,
//     numParseOptions:{
//         hex: true,
//         leadingZeros: true,
//         //skipLike: /\+[0-9]{10}/
//     }
//     arrayMode: false, //"strict"
//     attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
//     tagValueProcessor : (val, tagName) => he.decode(val), //default is a=>a
//     stopNodes: ["parse-me-as-string"]
// };

const INPUT_ZONE = {
    'MAIN': 'Main_Zone',
    'TUNER': 'Tuner',
    'AirPlay': 'AirPlay',
    'Spotify': 'Spotify',
    'Deezer': 'Deezer',
    'IPOD_USB': 'iPod_USB',
    'USB': 'USB',
    'NET RADIO': 'NET_RADIO',
    'SERVER': 'SERVER',
    'BLUETOOTH': 'BLUETOOTH',
    'MusicCast Link': 'MusicCast Link'
};

class yamaha_av{
    constructor(ip='', zone=DEFAULT_ZONE){
        this._ip = ip;
        this._zone = zone;
        this._basicStatus = {}; // buffered device status, refreshed on getBasicStatus()
    }
    
    setZone(zone){
        if (zone=='Main_Zone' || zone=='Zone2' || zone=='Zone3' || zone=='Zone4'){
            this._zone = zone;
        }
        else{
            throw new Error('Invalid zone');
        }
    }
    
    // SSDP Discovery ===============================================================================
	async discoverSSDP(timeout) {
		let p = new Promise(async function(resolve, reject) {
			let devices = [];
			// Create and configure simpleSSDP object
			const ssdp = new simpleSSDP(
                {
                    device_name: 'MediaRenderer',
                    // port: 8000,
                    // location: '/xml/description.xml',
                    // product: 'Musiccast',
                    // product_version: '2.0'
                }
            );
			// Start
			ssdp.start();
			// Event: service discovered
			ssdp.on('discover', (data) => {
				if (data['st'] == 'urn:schemas-upnp-org:device:MediaRenderer:1') {
					//console.log('got data', data['address']);
					var isFound = false;
					if (devices.length == 0) devices.push(data);
					for (let i = 0; i < devices.length; i++) {
						if (devices[i].address === data.address) {
							isFound = true;
							break;
						}
					}
					if (!isFound) {
						devices.push(data);
					}
				}
			});
			// Event: error
			ssdp.on('error', (err) => {
				console.log(err);
				reject('error in ssdp', e);
				return;
			});
			// Discover all services on the local network
			ssdp.discover();
			// Stop after 6 seconds
			await new Promise((cb) => setTimeout(cb, timeout || 5000));
			// console.table(devices);
			ssdp.stop(() => {
				console.log('SSDP stopped');
			});
			resolve(devices);
		});
		return await p;
	}

    // Basic data / API requests ===============================================================================
    async getSystemConfig(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="GET"><System><Config>GetParam</Config></System></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async getZoneConfig(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="GET"><'+this._zone+'><Config>GetParam</Config></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async getBasicStatus(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="GET"><'+this._zone+'><Basic_Status>GetParam</Basic_Status></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        // buffer the data for detail requests on single values
        this._basicStatus = json;
        return json;
    }

    // Additional data reading buffered values ================================================================
    async isOn(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return (this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Power_Control.Power == 'On');
    }

    async isOff(useBuffer=false){
        return (!this.isOn(useBuffer));
    }
    async isMuted(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return (this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Volume.Mute == 'On');
    }
    async getVolume(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return this._decibelToPercentile(this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Volume.Lvl.Val);
    }
    async getCurrentInput(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Input.Input_Sel;
    }
    async getCurrentSurroundProgram(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Surround.Program_Sel.Current.Sound_Program;
    }
    async isDirectEnabled(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return (this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Sound_Video.Direct.Mode == 'On');
    }
    async isEnhancerEnabled(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return (this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Surround.Program_Sel.Current.Enhancer == 'On');
    }
    async isExtraBassEnabled(useBuffer=false){
        if (!useBuffer || this._basicStatus == {}){
            await this.getBasicStatus();
        }
        if (this._basicStatus == {}){
            throw new Error('No data found');
        }
        return (this._basicStatus.YAMAHA_AV[this._zone].Basic_Status.Sound_Video.Extra_Bass == 'Auto');
    }
    async getPlayInfo(input){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let zone = this._getInputZone(input);
        let payload = '<YAMAHA_AV cmd="GET"><'+zone+'><Play_Info>GetParam</Play_Info></'+zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json.YAMAHA_AV[zone];
    }
    async powerOn(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Power_Control><Power>On</Power></Power_Control></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async powerOff(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Power_Control><Power>Standby</Power></Power_Control></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async setPower(state){
        if(state){
            return await this.powerOn();
        }
        else{
            return await this.powerOff();
        }
    }
    async setVolume(volume){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let volumeDb = this._percentileToDecibel(volume);
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Volume><Lvl><Val>'+volumeDb+'</Val><Exp>1</Exp><Unit>dB</Unit></Lvl></Volume></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async muteOn(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Volume><Mute>On</Mute></Volume></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async muteOff(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Volume><Mute>Off</Mute></Volume></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async setMute(state){
        if(state){
            return await this.muteOn();
        }
        else{
            return await this.muteOff();
        }
    }
    async directOn(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Sound_Video><Direct><Mode>On</Mode></Direct></Sound_Video></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async directOff(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Sound_Video><Direct><Mode>Off</Mode></Direct></Sound_Video></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async setDirect(state){
        if(state){
            return await this.directOn();
        }
        else{
            return await this.directOff();
        }
    }
    async enhancerOn(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Surround><Program_Sel><Current><Enhancer>On</Enhancer></Current></Program_Sel></Surround></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async enhancerOff(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Surround><Program_Sel><Current><Enhancer>Off</Enhancer></Current></Program_Sel></Surround></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async setEnhancer(state){
        if(state){
            return await this.enhancerOn();
        }
        else{
            return await this.enhancerOff();
        }
    }
    async extraBassOn(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Sound_Video><Extra_Bass>Auto</Extra_Bass></Sound_Video></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async extraBassOff(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Sound_Video><Extra_Bass>Off</Extra_Bass></Sound_Video></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async setExtraBass(state){
        if(state){
            return await this.extraBassOn();
        }
        else{
            return await this.extraBassOff();
        }
    }
    async setInput(input){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Input><Input_Sel>' + input + '</Input_Sel></Input></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async setSurroundProgram(surroundProgram){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Surround><Program_Sel><Current><Straight>Off</Straight><Sound_Program>' + surroundProgram + '</Sound_Program></Current></Program_Sel></Surround></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async soundAdaptiveDRCOn(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Sound_Video><Adaptive_DRC>On</Adaptive_DRC></Sound_Video></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async soundAdaptiveDRCOff(){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Sound_Video><Adaptive_DRC>Off</Adaptive_DRC></Sound_Video></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async setSoundAdaptiveDRC(state){
        if(state){
            return await this.soundAdaptiveDRCOn();
        }
        else{
            return await this.soundAdaptiveDRCOff();
        }
    }
    async setPlayControl(state){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+this._zone+'><Play_Control><Playback>' + state + '</Playback></Play_Control></'+this._zone+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async play(){
        await this.setPlayControl('Play');
    }
    async pause(){
        await this.setPlayControl('Pause');
    }
    async next(){
        await this.setPlayControl('Skip Fwd');
    }
    async prev(){
        await this.setPlayControl('Skip Rev');
    }
    async setListItem(list, item){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><'+list+'><List_Control><Direct_Sel>Line_'+item+'</Direct_Sel></List_Control></'+list+'></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async selectNetRadioListItem(item){
        // set correct input
        // await this.setInput("NET RADIO");
        // sekect first list line (favorites...)
        // await this.setListItem('NET_RADIO', 1);
        // select favorites list entry
        await this.setListItem('NET_RADIO', item);
    }
    async selectUSBListItem(item){
        // set correct input
        return await this.setListItem('USB', item);
    }
    async selectNetRadioPreset(item){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><NET_RADIO><Play_Control><Preset><Preset_Sel>'+item+'</Preset_Sel></Preset></Play_Control></NET_RADIO></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }
    async selectTunerPreset(item){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><Tuner><Play_Control><Preset><Preset_Sel>'+item+'</Preset_Sel></Preset></Play_Control></Tuner></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }

    async sendRcCode(code){ 
        // 7C80 = Power on/off
        //DSZ-Z7: <System><Remote_Signal><Receive><Code>***</Code></Receive></Remote_Signal></System>
        //RX-Vx7x: <System><Misc><Remote_Signal><Receive><Code>***</Code></Receive></Remote_Signal></Misc></System>
        //var command = '<YAMAHA_AV cmd="PUT"><Main_Zone><Remote_Control><RC_Code>' + code + '</RC_Code></Remote_Control></Main_Zone></YAMAHA_AV>';
        //var command = '<YAMAHA_AV cmd="PUT"><System><Misc><Remote_Signal><Receive><Code>' + code + '</Code></Receive></Remote_Signal></Misc></System></YAMAHA_AV>';
        //var command = '<YAMAHA_AV cmd="PUT"><System><Remote_Signal><Receive><Code>' + code + '</Code></Receive></Remote_Signal></System></YAMAHA_AV>';
        if (typeof code == 'number') {
            code = code.toString(16);
        }
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let payload = '<YAMAHA_AV cmd="PUT"><System><Remote_Control><RC_Code>' + code + '</RC_Code></Remote_Control></System></YAMAHA_AV>';
        let xml = await this._httpPost(payload);
        let json = parser.parse(xml);
        return json;
    }

    async sendXML(xmlCommand){
        if (this._ip == ''){
            throw new Error('IP not set');
        }
        let xml = await this._httpPost(xmlCommand);
        let json = parser.parse(xml);
        return json;
    }


    // Helper =============================================================================================
    _decibelToPercentile(decibel) {
        let max = 970,
            offset = 805;
        return parseFloat(((decibel + offset) / (max / 100)).toPrecision(4));
    }

    _percentileToDecibel(percentile) {
        let max = 970,
            offset = 805,
            stepSize = 5,
            decibelVolume = parseInt((max * (percentile / 100)) - offset),
            diff = decibelVolume % stepSize;
        if (diff < (stepSize / 2)) {
            return parseInt(decibelVolume - diff);
        } else {
            return parseInt(decibelVolume + (stepSize - diff));
        }
    }

    _getInputZone(input){
        try{
            let zone = INPUT_ZONE[input];
            if (zone == undefined){
                zone = INPUT_ZONE['MAIN'];
            } 
            return zone;
        }
        catch(error){ throw new Error('Invalid INPUT');}
    }

    // http handler =========================================================================================
    _httpPost(payload) {
        return new Promise((resolve, reject) => {
            let url = 'http://'+this._ip+'/YamahaRemoteControl/ctrl';
            let options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/xml',
                    'Content-Length': Buffer.byteLength(payload),
                },
                maxRedirects: 20,
                keepAlive: false
            };
            const req = http.request(url, options, res => {
                if (res.statusCode !== 200) {
                    // console.log('Failed to POST to url:' + url +' status code: '+res.statusCode);
                    return reject( new Error('Failed to POST to url:' + url +' status code: '+res.statusCode));
                }
                res.setEncoding('utf8');
                const data = [];

                res.on('data', chunk => data.push(chunk));
                res.on('end', () => {
                    return resolve(data.join(''));
                });
            });

            req.on('error', (error) => reject(error));
            req.write(payload);
            req.end();
        });
    }
}

module.exports = yamaha_av;