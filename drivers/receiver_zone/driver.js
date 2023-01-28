"use strict";
const Homey = require('homey');

class receiverZoneDriver extends Homey.Driver {
    onPair(session) {
        this.log("onPair()");
        let receiver = {};
        let listView = 1;

        session.setHandler('showView', async (view) => {
            if (view === 'list_devices_receiver') {
                // listView = 1;
            }
            if (view === 'list_devices_zone') {
                // listView = 2;
            }
        });

        session.setHandler("list_devices", async () => {
            let devices = [];

            if (listView == 1){
                listView = 2;
                this.log("showView:list_devices, receiver list");
                
                let receivers = this.homey.drivers.getDriver('receiver').getDevices();
                for (let i=0; i<receivers.length; i++){
                    devices.push(
                        {
                            name: receivers[i].getName(),
                            data: {
                            id: receivers[i].getData().id
                            },
                            icon: "../../receiver/assets/icon.svg"
                        }
                    );
                }
                this.log("Found devices:");
                this.log(devices);
                return devices;
            }
              else{
                listView = 1;
                this.log("showView:list_devices, zone list");

                if (receiver && receiver.data && receiver.data.id){
                
                    let receivers = this.homey.drivers.getDriver('receiver').getDevices();
                    for (let i=0; i<receivers.length; i++){
                        if (receivers[i].getData().id == receiver.data.id){
                            let features = await receivers[i].getApi().getFeatures();
                            for (let j=1; j<features.zone.length; j++){
                                devices.push({
                                    data: {
                                        id: receiver.data.id,
                                        zone: features.zone[j].id
                                    },
                                    name: receiver.name + " " + this.homey.__("pair.list_devices_zone.zone") + " " + (j+1)
                                });
                            }
                        }
                    }
                }
                this.log("Found devices:");
                this.log(devices);
                return devices;
            }        
          
        });

        session.setHandler('list_devices_receiver_selection', async (data) => {
            console.log("handler: list_devices_receiver_selection");
            console.log(data[0]);
            receiver = data[0];
        });

        session.setHandler('list_devices_zone_selection', async (data) => {
            console.log("handler: list_devices_zone_selection");
            console.log(data[0]);
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

}
module.exports = receiverZoneDriver;