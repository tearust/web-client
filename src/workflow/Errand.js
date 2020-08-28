import Layer1 from '../tea/layer1';
import utils from '../tea/utils';
import _ from 'lodash';
import ed25519 from '../shared/utility/ed25519';
import Log from '../shared/utility/Log';
import proto from '../tea/proto';
import http from '../tea/http';
import toHex from 'to-hex';
import BN from 'bn.js';

const {Protobuf, stringToU8, u8ToString} = proto;

const log = Log.create('Errand');

export default class {
  deployed_code = null;
  deployed_data = null;
  
  layer1_account = null;
  nonce = null;
  layer1_balance = null;  // amount, locked

  delegator_tea_id = null;
  delegator_ephemeral_id = null;
  task_sign = null;

  adhoc_code = {};
  adhoc_data = {};

  ed = null;

  deposit_tx_id = null;

  last_task_id = null;


  constructor(){
    this.layer1 = null;
    
    const ed = utils.cache.get('ed25519');
    if(ed){
      this.ed = ed;
    }
    else{
      this.ed = ed25519.keypair();
      utils.cache.put('ed25519', this.ed);
    }
    log.d('ed25519 (hex)', this.ed);
    
  }

  setLayer1Account(account){
    this.layer1_account = account;
  }

  async init(){
    const c = utils.get_env('CID_OF_CODE');
    const d = utils.get_env('CID_OF_DATA');
    
    if(c){
      this.deployed_code = {
        deployment_id: utils.get_env('DEPLOYMENT_ID_FOR_CODE'),
        checker: utils.get_env('CID_OF_CHECKER'),
        cid: c
      };
    }
    if(d){
      this.deployed_data = {
        deployment_id: utils.get_env('DEPLOYMENT_ID_FOR_DATA'),
        cid: d
      };
    }

    console.log(999, this.deployed_code, this.deployed_data);

    await this.initLayer1();
  }

  async initLayer1(){
    if(!this.layer1){
      try{
        this.layer1 = new Layer1();
        await this.layer1.init();

      }catch(e){
        console.error(e);
      }
    }
  }

  async getLayer1AccountBalance(){
    if(!this.layer1_account){
      throw 'invalid layer1 account';
    }

    const pb = new Protobuf('actor_delegate.QueryBalanceRequest');
    pb.payload({
      accountId: stringToU8(this.layer1_account)
    });

    const buf = pb.encode();
    const buf_64 = utils.uint8array_to_base64(buf);
    const res = await http.getBalanceInfo(buf_64);

    log.d('getBalanceInfo response ', res);
    this.layer1_balance = {
      amount: _.get(res, 'balance'),
      locked: _.get(res, 'locked'),
    };
  }

  async requestBeMyDelegate(){
    if(!this.layer1_account){
      throw 'invalid layer1 account';
    }

    const pb = new Protobuf('actor_delegate.BeMyDelegateRequest');

    this.nonce = _.random(100000000).toString();

    pb.payload({
      layer1Account: stringToU8(this.layer1_account),
      nonce: stringToU8(this.nonce)
    });

    const buf = pb.encode();
    const buf_64 = utils.uint8array_to_base64(buf);
    log.d('BeMyDelegateRequest base64 = ', buf_64);

    const res = await http.requestBeMyDelegate(buf_64);
    log.d('BeMyDelegateRequest response ', res);

    // TODO post to delegator
    this.delegator_tea_id = _.get(res, 'delegator_tea_id');
    this.delegator_ephemeral_id = _.get(res, 'delegator_ephemeral_id');
    this.task_sign = _.get(res, 'sig');
    this.layer1_balance = {
      amount: _.get(res, 'balance'),
      locked: _.get(res, 0),
    };
    // this.deposit_tx_id = _.get(res, 'tx_id');

    await this.getLayer1AccountBalance();

    // if(this.layer1_balance.amount === 0){
    //   await this.depositToAgentAccount();
    // }
    
  }

  async depositToAgentAccount(){
    const payload = {
      // delegator_ephemeral_id: toHex(this.delegator_ephemeral_id, {addPrefix: true}),
      // deposit_pub_key: toHex(this.ed.pub, {addPrefix: true}),
      // delegator_signature: toHex(this.task_sign, {addPrefix: true}),
      delegator_ephemeral_id: '0x'+this.delegator_ephemeral_id,
      deposit_pub_key: '0x'+this.ed.pub,
      delegator_signature: '0x'+this.task_sign,
      amount: this.paymentUnit(10),
      // amount: "10",
      expire_time: (999999)
    };
    log.d('deposit payload => ', payload);

    return new Promise((resolve, reject)=>{
      this.layer1.deposit(this.layer1_account, payload, async (flag, block_hex)=>{
        log.d('depositToAgentAccount', flag, block_hex);
        if(flag){
          alert("success");
          this.deposit_tx_id = block_hex;
  
          await this.requestBeMyDelegate();

          resolve();
        }
        else{
          reject()
        }
        
      });
    });
    

    // this.deposit_tx_id = 'deposit_tx_id';

  }

  buildTaskJson(){
    const task_json = {};
    if(this.deployed_code){
      _.set(task_json, 'deployed_code', {
        deployment_id_for_code: this.deployed_code.deployment_id,
        cid_of_code: this.deployed_code.cid,
        cid_of_checker: this.deployed_code.checker
      });
    }
    else{
      _.set(task_json, 'adhoc_code', this.adhoc_code);
    }


    if(this.deployed_data){
      _.set(task_json, 'deployed_data', {
        deployment_id_for_data: this.deployed_data.deployment_id,
        cid_of_data: this.deployed_data.cid
      });
    }
    else{
      _.set(task_json, 'adhoc_data', this.adhoc_data);
    }
    _.set(task_json, 'deposit_tx_id', this.deposit_tx_id);

    return task_json;
  }

  async startTask(){
    log.d('Start Task');
    const json = this.buildTaskJson();
    log.d('task json', json);

    const json_b64 = utils.forge.util.encode64(JSON.stringify(json));
    log.d('task json base64', json_b64);

    const task_id = utils.uuid();
    this.last_task_id = task_id;
    const proof_of_delegate = ed25519.sign(`${this.delegator_ephemeral_id}${task_id}`, this.ed.pri);

    const url = `/api/service/${this.layer1_account}/${task_id}/${proof_of_delegate}`;
    const res = await http.requestErrandTask(url, json_b64);

    log.d('requestErrandTask response', res);
  }

  // async start_task(){
  //   // step 1
  //   log.d('Step 1');
  //   await this.requestBeMyDelegate();

  //   // step 3
  //   log.d('Step 3');
  //   this.ed = ed25519.keypair();

  //   // step 4
  //   log.d('Step 4');
  //   await this.depositToAgentAccount();

  //   // step 7
  //   log.d('Step 7');
    

  // }

  paymentUnit(n){
    const yi = new BN('100000000', 10);
    const million = new BN('10000000', 10);
    const unit = yi.mul(million);

    const payment = parseInt(n, 10) * unit;
    return payment.toString();
  }

}