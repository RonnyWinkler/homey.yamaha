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

    this._flowActionSurroundProgramSelect = this.homey.flow.getActionCard('surround_program_select')
    this._flowActionSurroundProgramSelect.registerRunListener(async (args, state) => {
      try{
        await args.device.surroundProgramSelect(args.surround_program);
        return true;
      }
      catch(error){
        this.error("Error executing flowAction 'input_select': "+  error.message);
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