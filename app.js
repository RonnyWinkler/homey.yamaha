if (process.env.DEBUG === '1')
{
    require('inspector').open(9222, '0.0.0.0', true);
}

'use strict';

const Homey = require('homey');
const http = require('http');

class yamahaApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Yamaha app has been initialized');

    // Register flows listener
    await this.registerFlowActions();

  }

  async registerFlowActions(){
    this._flowActionInputSelect = this.homey.flow.getActionCard('input_select')
    this._flowActionInputSelect.registerRunListener(async (args, state) => {
      try{
        await args.device.inputSelect(args.input);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'input_select': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionInputAvSelect = this.homey.flow.getActionCard('input_av_select')
    this._flowActionInputAvSelect.registerRunListener(async (args, state) => {
      try{
        await args.device.inputSelect(args.input);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'input_av_select': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionSurroundProgramSelect = this.homey.flow.getActionCard('surround_program_select')
    this._flowActionSurroundProgramSelect.registerRunListener(async (args, state) => {
      try{
        await args.device.surroundProgramSelect(args.surround_program);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'surround_program_select': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionSurroundProgramAvSelect = this.homey.flow.getActionCard('surround_program_av_select')
    this._flowActionSurroundProgramAvSelect.registerRunListener(async (args, state) => {
      try{
        await args.device.surroundProgramSelect(args.surround_program);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'surround_program_av_select': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionDirectOn = this.homey.flow.getActionCard('direct_on')
    this._flowActionDirectOn.registerRunListener(async (args, state) => {
      try{
        await args.device.directSet(true);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'direct_on': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionDirectOff = this.homey.flow.getActionCard('direct_off')
    this._flowActionDirectOff.registerRunListener(async (args, state) => {
      try{
        await args.device.directSet(false);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'direct_off': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionEnhancerOn = this.homey.flow.getActionCard('enhancer_on')
    this._flowActionEnhancerOn.registerRunListener(async (args, state) => {
      try{
        await args.device.enhancerSet(true);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'enhancer_on': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionEnhancerOff = this.homey.flow.getActionCard('enhancer_off')
    this._flowActionEnhancerOff.registerRunListener(async (args, state) => {
      try{
        await args.device.enhancerSet(false);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'enhancer_off': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionBassOn = this.homey.flow.getActionCard('bass_on')
    this._flowActionBassOn.registerRunListener(async (args, state) => {
      try{
        await args.device.bassSet(true);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'bass_on': "+  error.message);
        throw new Error(error.message);
      }
    });

    this._flowActionBassOff = this.homey.flow.getActionCard('bass_off')
    this._flowActionBassOff.registerRunListener(async (args, state) => {
      try{
        await args.device.bassSet(false);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'bass_off': "+  error.message);
        throw new Error(error.message);
      }
    });

    // this._flowActionNetRadioItemSelect = this.homey.flow.getActionCard('netradio_item_select')
    // this._flowActionNetRadioItemSelect.registerRunListener(async (args, state) => {
    //   try{
    //     await args.device.selectNetRadioListItem(args.item);
    //     return true;
    //   }
    //   catch(error){
    //     this.error("Error executing flowAction 'netradio_item_select': "+  error.message);
    //     throw new Error(error.message);
    //   }
    // });

    this._flowActionNetRadioPresetSelect = this.homey.flow.getActionCard('netradio_preset_select')
    this._flowActionNetRadioPresetSelect.registerRunListener(async (args, state) => {
      try{
        await args.device.selectNetRadioPreset(args.item);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'netradio_preset_select': "+  error.message);
        throw new Error(error.message);
      }
    });
    
    this._flowActionSendRcCode = this.homey.flow.getActionCard('send_rc_code')
    this._flowActionSendRcCode.registerRunListener(async (args, state) => {
      try{
        await args.device.sendRcCode(args.code);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'send_rc_code': "+  error.message);
        throw new Error(error.message);
      }
    });

  }

  async httpGet(url, options){
    return new Promise( ( resolve, reject ) =>
    {
        try
        {
          let request = http
            .get(url, options, (response) => { 
              if (response.statusCode !== 200){
                response.resume();

                let message = "";
                if ( response.statusCode === 204 )
                { message = "No Data Found"; }
                else if ( response.statusCode === 400 )
                { message = "Bad request"; }
                else if ( response.statusCode === 401 )
                { message = "Unauthorized"; }
                else if ( response.statusCode === 403 )
                { message = "Forbidden"; }
                else if ( response.statusCode === 404 )
                { message = "Not Found"; }
                reject( new Error( "HTTP Error: " + response.statusCode + " " + message ) );
                return;
              }
              else{
                let rawData = '';
                response.setEncoding('utf8');
                response.on( 'data', (chunk) => { rawData += chunk; })
                response.on( 'end', () => {
                  resolve( rawData );
                })
              }
            })
            .on('error', (err) => {
              //console.log(err);
              reject( new Error( "HTTP Error: " + err.message ) );
              return;
            });
          request.setTimeout( 5000, function()
            {
              request.destroy();
              reject( new Error( "HTTP Catch: Timeout" ) );
              return;
            });
          }
        catch ( err )
        {
            reject( new Error( "HTTP Catch: " + err.message ) );
            return;
        }
    });
  }

  async httpGetStream(url, options = {}){
    return new Promise( ( resolve, reject ) =>
    {
        try
        {
          let request = http
            .get(url, options, (response) => { 
              if (response.statusCode !== 200){
                response.resume();

                let message = "";
                if ( response.statusCode === 204 )
                { message = "No Data Found"; }
                else if ( response.statusCode === 400 )
                { message = "Bad request"; }
                else if ( response.statusCode === 401 )
                { message = "Unauthorized"; }
                else if ( response.statusCode === 403 )
                { message = "Forbidden"; }
                else if ( response.statusCode === 404 )
                { message = "Not Found"; }
                reject( new Error( "HTTP Error: " + response.statusCode + " " + message ) );
                return;
              }
              else{
                return resolve( response );
              }
            })
            .on('error', (err) => {
              //console.log(err);
              reject( new Error( "HTTP Error: " + err.message ) );
              return;
            });
          request.setTimeout( 5000, function()
            {
              request.destroy();
              reject( new Error( "HTTP Catch: Timeout" ) );
              return;
            });
          }
        catch ( err )
        {
            reject( new Error( "HTTP Catch: " + err.message ) );
            return;
        }
    });
  }

}
  
module.exports = yamahaApp;