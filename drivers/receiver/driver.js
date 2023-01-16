"use strict";
const Homey = require('homey');
const YamahaYXC = require('yamaha-yxc-nodejs').YamahaYXC;

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
                        try{
                            // let yamaha = new YamahaYXC(discover[i].address);
                            // let details = await yamaha.getDeviceInfo();
                            // if (yamaha && details){
                                let device = {
                                    name: discover[i]["x-modelname"].split(":")[2],
                                    data: {
                                        id: discover[i]["x-modelname"].split(":")[1]
                                    },
                                    settings:{
                                        ip: discover[i].address,
                                        type: discover[i]["x-modelname"].split(":")[0]
                                    }
                                };
                                devices.push(device);
                            // }
                        }
                        catch(error){
                            this.log("onPair:showView:discover: Error getting device data: ", error.message);
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
                    let yamaha = new YamahaYXC(pair_ip);
                    let details = await yamaha.getDeviceInfo();
                    if (details){
                        let device = {
                            name: details.model_name,
                            data: {
                                id: details.device_id
                            },
                            settings:{
                                ip: yamaha.ip,
                                type: details.model_name
                            }
                        };
                        devices.push(device);
                    }
                    if (devices.length > 0){
                        await session.showView("list_devices");
                    }
                    else{
                        await session.showView("add_by_ip");
                    }
    
                }
                catch(error){
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
}
module.exports = receiverDriver;