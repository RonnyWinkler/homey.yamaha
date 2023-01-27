"use strict";
const Homey = require('homey');

// dynamic require at pairing
// const YamahaAV = require("../../lib/yamaha_av");

class receiverDriver extends Homey.Driver {
    onPair(session) {
        this.log("onPair()");
        let devices = [];
        let pair_ip = "";

        session.setHandler('showView', async (view) => {
            if (view === 'discover') {
                this.log("showView:discover" );
                let yamaha = new (require("../../lib/yamaha_av"))();
                let discover = [];
                try{

                    discover = await yamaha.discoverSSDP(5000);
                }
                catch(error){this.log("No devices found: ", error.message);}
                devices = [];
                for (let i=0; i<discover.length; i++){
                    if (discover[i]["x-modelname"] != undefined){
                        let ip = discover[i].address;
                        if (ip != undefined && ip != ""){
                            try{
                                // check if API in found
                                let device = await this.getDeviceData(ip);
                                // check if device is already added
                                try{
                                    this.getDevice(  {id: device.data.id} )
                                }
                                // if not found (exception), the add as discoverred device
                                catch(error){
                                    devices.push(device);
                                }
                            }
                            catch(error){
                                this.log("showView:discover: Error getting RemoteControl API access.");
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
                devices = [];
                try{
                    let device = await this.getDeviceData(pair_ip);
                    try{
                        this.getDevice(  {id: device.data.id} )
                    }
                    // if not found (exception), the add as discoverred device
                    catch(error){
                        devices.push(device);
                    }
                }
                catch(error){
                    this.log("showView:check_ip: ", error.message);
                    await session.showView("add_by_ip");
                    // await session.emit("alert", "Device not found");
                }
                if (devices.length > 0){
                    await session.showView("list_devices");
                }
                else{
                    await session.showView("add_by_ip");
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

    async getDeviceData(ip){
        try{
            // let yamaha = new YamahaAV(ip);
            // let yamaha = new (require("../../lib/yamaha-nodejs"))(ip);
            let yamaha = new (require("../../lib/yamaha_av"))(ip);
            let system = await yamaha.getSystemConfig();
            this.log("API data: ", system);
            if (system && system.YAMAHA_AV && system.YAMAHA_AV.System && system.YAMAHA_AV.System.Config ){
                let device = {
                    name: system.YAMAHA_AV.System.Config.Model_Name,
                    data: {
                        id: system.YAMAHA_AV.System.Config.System_ID
                    },
                    settings:{
                        ip: ip,
                        type: system.YAMAHA_AV.System.Config.Model_Name
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
}
module.exports = receiverDriver;