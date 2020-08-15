import axios from 'axios';
import _ from 'lodash';
import utils from './utils';

let _axios = null;
const init = ()=>{
  const baseUrl = utils.getHttpBaseUrl();

  _axios = axios.create({
    baseURL: baseUrl
  
  });

  _axios.interceptors.response.use((res)=>{
    console.log('[http response]', res.data);
    if(res.data){
      if(res.data.data){
        console.log(111, res.data);
        try{
          return Promise.resolve(JSON.parse(res.data.data));
        }catch(e){
          return res.data.data;
        }
      }
      return Promise.resolve(res.data);
    }
  }, (error)=>{
    return Promise.reject(error);
  });
}

const F = {
  initBaseUrl: init,
  requestActiveNodes() {
    return _axios.get('/api/request_active_nodes');
    // return [
    //   {
    //     "tea_id": "c7e016fad0796bb68594e49a6ef1942cf7e73497e69edb32d19ba2fab3696596",
    //     "nkn_id": "nkn_id",
    //     "http": "http://127.0.0.1:8000",
    //     "rsa": "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0NCk1Gd3dEUVlKS29aSWh2Y05BUUVCQlFBRFN3QXdTQUpCQUxpV0pYYkxwYXlLL0hmQXFVRnVCOEUvdCtEQlFQUkgNCmFpQWRleFF6ODludThXSlJJUDc2QUJWdHdOeHN3WTNKZnZTVTMrcEkzaUhRem9LWEp0WTYxaVVDQXdFQUFRPT0NCi0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQ0K",
    //     "ping": "",
    //     "ws": "ws://127.0.0.1:8001",
    //     "credit": 0,
    //     "update_time": ""
    //   },
    // ]
  },
  putToIpfs(data) {
    return _axios.post('/ipfs', data);
  },
  registerNewTask(proto_buf){
    return _axios.post('/api/register_task', proto_buf);
  },


  registerData(proto_buf_b64){
    return _axios.post('/api/register_data', proto_buf_b64);

    // return new Promise((resolve)=>{
    //   resolve({
    //     rsa_pub_key: `-----BEGIN RSA PUBLIC KEY-----
    //     MIIBCgKCAQEA9zlzDmuOxB4x14CMfICBX6WZaN2hcHJH8UGg2fWzVm1GxqNSEl/6
    //     gFiZq/w5I8R9izGyfT5/dycTvQB0miaLB9f4w/m/UX3uygmJ2zemsMY6yCHjk0WO
    //     Z4NWtmJBA0uQ6+qjCOFZLr7AXTrcZ5NJNUg4AEAdCDJDkekefGzzyoBVhkC1328y
    //     2niGFRCcppVR7iXcrAIv5Jbv0f5wLwlzDu/1tp18GTryVhld+Cg+iAch5T2nGAXF
    //     HCGXbn7fnoNfH1p4RaYRC+rzhzc+PrAOPCD4skZ4xa7zP95dG+txvZNx+ah3r4H4
    //     GhmqjqF+tLxTqknZkaDLUX1hItLb5RUsGQIDAQAB
    //     -----END RSA PUBLIC KEY-----`
    //   });
    // });
  },

  /**
   * @param type: description, data
   * @param ekey1 
   * @param rsa_pub_key 
   */
  postDataWithRsaKey(type, data, ekey1, rsa_pub_key){
    rsa_pub_key = encodeURIComponent(rsa_pub_key);
    ekey1 = encodeURIComponent(ekey1);
    const url = `/ipfs?cid_type=${type}&ekey=${ekey1}&rsa_pub=${rsa_pub_key}`;

    return _axios.post(url, data);
  }
};


export default F;