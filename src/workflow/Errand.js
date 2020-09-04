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
  layer1_account_amount = 0;
  nonce = null;
  layer1_balance = null;  // amount, locked

  delegator_tea_id = null;
  delegator_ephemeral_id = null;
  task_sign = null;

  adhoc_code = {};
  adhoc_data = {};

  deposit_tx_id = null;

  last_task_id = null;

  last_rsa_pub_key = null;
  last_ekey3 = null;

  loop_running = false;

  constructor(){
    this.layer1 = null;

    utils.crypto.get_secret();
    
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

    this.layer1_account_amount = await this.layer1.getAccountBalance(this.layer1_account);

    const pb = new Protobuf('actor_delegate.QueryBalanceRequest');
    pb.payload({
      accountId: (this.layer1_account),
      delegatorTeaId: stringToU8(this.delegator_tea_id),
    });

    const buf = pb.encode();
    const buf_64 = utils.uint8array_to_base64(buf);
    const res = await http.getBalanceInfo(buf_64);

    log.d('getBalanceInfo response ', res);
    if(res.balance){
      this.layer1_balance = {
        amount: _.get(res, 'balance'),
        locked: _.get(res, 'locked'),
      };
    }
    else{
      this.layer1_balance = {
        amount: 0,
        locked: 0,
      };
    }

    
  }

  async requestBeMyDelegate(){
    if(!this.layer1_account){
      throw 'invalid layer1 account';
    }

    const pb = new Protobuf('actor_delegate.BeMyDelegateRequest');

    this.nonce = _.random(100000000).toString();

    pb.payload({
      layer1Account: (this.layer1_account),
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
    this.last_rsa_pub_key = res.key3_rsa_pub_key;
    log.d("RSA Pubkey", this.last_rsa_pub_key);

    utils.crypto.set_rsa_publickey(this.last_rsa_pub_key);
    const {key_encrypted} = utils.crypto.get_secret();
    this.last_ekey3 = key_encrypted;
    log.d("ekey3", this.last_ekey3);

    // this.deposit_tx_id = _.get(res, 'tx_id');

    await this.getLayer1AccountBalance();
    
  }

  async depositToAgentAccount(number=1000){
    const payload = {
      delegator_tea_id: '0x'+this.delegator_tea_id,
      delegator_ephemeral_id: '0x'+this.delegator_ephemeral_id,
      delegator_signature: '0x'+this.task_sign,
      amount: this.paymentUnit(number),
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
    _.set(task_json, 'encrypted_key3', this.last_ekey3);

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
    const sig = await this.layer1.sign(this.layer1_account, `${this.delegator_ephemeral_id}${task_id}`);
    if(!sig){
      alert('Sign error');
      return false;
    }
    const proof_of_delegate = sig;
    const url = `/api/service/${this.layer1_account}/${task_id}/${proof_of_delegate}`;
    const res = await http.requestErrandTask(url, json_b64);

    log.d('requestErrandTask response', res);
  }

  paymentUnit(n){
    const unit = this.layer1.asUnit();

    const payment = parseInt(n, 10) * unit;
    return payment.toString();
  }
  

  loopTaskResult(flag=false, cb){
    if(!flag){
      this.loop_running = false;
      return false;
    }
    if(this.loop_running){
      return false;
    }

    this.loop_running = true;

    this.loopTaskResultFromDelegate(cb);
  }

  async loopTaskResultFromDelegate(cb){
    if(!this.loop_running) return false;

    const loop = ()=>{
      _.delay(()=>{
        this.queryTaskResult().then((res)=>{
          if(!res.completed){
            loop();

          }
          else{
            cb(res);
            this.loop_running = false;
          }
          
        })
      }, 5000);
    };

    loop();
  }

  async queryTaskResult(){
    const url = '/api/query_errand_execution_result';

    const pb = new Protobuf("actor_delegate.QueryErrandExecutionResult");
    pb.payload({
      errandId: stringToU8(this.last_task_id),
    });

    const buf = pb.encode();
    const buf_64 = utils.uint8array_to_base64(buf);

    const res = await http.post(url, buf_64);
    log.d("queryTaskResult response\n", res);
    return res;
  }

}