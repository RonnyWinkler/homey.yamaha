"use strict";
const Homey = require('homey');
const YamahaYXC = require('../../lib/yamaha_yxc');

class receiverDriver extends Homey.Driver {
    onPair(session) {
        this.log("onPair()");
        let devices = [];
        let pair_ip = "";

        session.setHandler('showView', async (view) => {
            if (view === 'discover') {
                this.log("showView:discover" );
                let yamahaSSDP = new YamahaYXC();
                let discover = await yamahaSSDP.discoverSSDP(5000);
                devices = [];
                for (let i=0; i<discover.length; i++){
                    if (discover[i]["x-modelname"] != undefined){
                        let ip = discover[i].address;
                        if (ip != undefined && ip != ""){
                            try{
                                // check if API in found
                                try{
                                    let device = await this.getDeviceData(ip);
                                    // try top get existing device 
                                    try{
                                        this.getDevice(  {id: device.data.id} )
                                    }
                                    // if not found (exception), the add as discoverred device
                                    catch(error){
                                        devices.push(device);
                                    }
                                }
                                catch(error){
                                    this.log("onPair:showView:discover: Error getting YXC API access.");
                                }
                            }
                            catch(error){
                                this.log("onPair:showView:discover: Error getting device data: ", error.message);
                            }
                        }
                    }
                }
                if (devices.length > 0){
                    await session.showView("list_devices");
                }
                else{
                    await session.showView("add_by_ip");
                }
            }
            if (view === 'check_ip') {
                this.log("showView:check_ip" );
                devices = [];
                if (pair_ip == ""){
                    await session.showView("add_by_ip");
                }
                try{
                    let device = await this.getDeviceData(pair_ip);
                    // check if device is already added
                    try{
                        this.getDevice(  {id: device.data.id} )
                    }
                    // if not found (exception), the add as discoverred device
                    catch(error){
                        devices.push(device);
                    }
                    if (devices.length > 0){
                        await session.showView("list_devices");
                    }
                    else{
                        await session.showView("not_found");
                    }
    
                }
                catch(error){
                    await session.showView("not_found");
                }
            }
        });

        session.setHandler('getReceiverIp', async () => {
            return pair_ip;
        });

        session.setHandler('setReceiverIp', async (ip) => {
            pair_ip = ip;
        });

        session.setHandler("list_devices", async () => {
            this.log("showView:list_devices" );
            this.log("Found devices:");
            this.log(devices);
            return devices;
        });
      
    } // end onPair

    async onRepair(session, device) {
        this.log("onRepair()");

        let log = {};
        let title = '';

        session.setHandler('onDeviceData', async (selection) => {
            switch (selection){
                case 'deviceInfo':
                    title = 'Device Info';
                    log = await device.getDeviceInfo();
                    await session.showView("device");
                    break;
                case 'deviceFeatures':
                    title = 'Device Features';
                    log = await device.getDeviceFeatures();
                    await session.showView("device");
                    break;
                case 'deviceStatus':
                    title = 'Device Status';
                    log = await device.getDeviceStatus();
                    await session.showView("device");
                    break;
                case 'devicePlayInfo':
                    title = 'Device Play Info';
                    log = await device.getDevicePlayInfo();
                    await session.showView("device");
                    break;
            }
            return true;       
        });

        session.setHandler('getDeviceData', async () => {
            return {
                log: log,
                title: title 
            };
        });
    

    } // end onRepair

    async getDeviceData(ip){
        try{
            let yamaha = new YamahaYXC(ip);
            let system = await yamaha.getDeviceInfo();
            this.log("API data: ", system);
            if (system && system.device_id && system.model_name ){
                let deviceId = '';
                if (system.device_id != undefined){
                    deviceId = system.device_id; 
                }
                else{
                    deviceId = system.system_id;
                }
                if (deviceId == ''){
                    deviceId = this.getUIID();
                }
                let device = {
                    name: system.model_name,
                    data: {
                        id: deviceId
                    },
                    settings:{
                        ip: ip,
                        type: system.model_name
                    }
                }
                return device;
            }
            else{
                throw new Error("Invalid devide data from discovered IP ", ip);
            }
        }
        catch(error){
            throw new Error("Invalid devide data from discovered IP ", ip);
        }
    }

    getUIID() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
        }
        return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    }

}
module.exports = receiverDriver;