const EventEmitter = require('events').EventEmitter
const hdkey = require('ethereumjs-wallet/hdkey')
const bip39 = require('bip39')
const ethUtil = require('ethereumjs-util')
const sigUtil = require('eth-sig-util')

// Options:
const hdPathString = `m/44'/60'/0'/0`
const type = 'HD Key Tree'

class HdKeyring extends EventEmitter {

  /* PUBLIC METHODS */

  constructor (opts = {}) {
    super()
    this.type = type
    this.deserialize(opts)
  }

  serialize () {
    return Promise.resolve({
      mnemonic: this.mnemonic,
      numberOfAccounts: this.wallets.length,
      hdPath: this.hdPath,
    })
  }

  deserialize (opts = {}) {
    this.opts = opts || {}
    this.wallets = []
    this.appKeys = []    
    this.mnemonic = null
    this.root = null
    this.hdPath = opts.hdPath || hdPathString

    if (opts.mnemonic) {
      this._initFromMnemonic(opts.mnemonic)
    }

    if (opts.numberOfAccounts) {
      return this.addAccounts(opts.numberOfAccounts)
    }

    return Promise.resolve([])
  }



  
  addAccounts (numberOfAccounts = 1) {
    if (!this.root) {
      this._initFromMnemonic(bip39.generateMnemonic())
    }

    const oldLen = this.wallets.length
    const newWallets = []
    for (let i = oldLen; i < numberOfAccounts + oldLen; i++) {
      const child = this.root.deriveChild(i)
      const wallet = child.getWallet()
      newWallets.push(wallet)
      this.wallets.push(wallet)
    }
    const hexWallets = newWallets.map((w) => {
      return sigUtil.normalize(w.getAddress().toString('hex'))
    })
    return Promise.resolve(hexWallets)
  }

  getAccounts () {
    return Promise.resolve(this.wallets.map((w) => {
      return sigUtil.normalize(w.getAddress().toString('hex'))
    }))
  }

  // tx is an instance of the ethereumjs-transaction class.
  signTransaction (address, tx) {
    const wallet = this._getWalletForAccount(address)
    var privKey = wallet.getPrivateKey()
    tx.sign(privKey)
    return Promise.resolve(tx)
  }

  // For eth_sign, we need to sign transactions:
  // hd
  signMessage (withAccount, data) {
    const wallet = this._getWalletForAccount(withAccount)
    const message = ethUtil.stripHexPrefix(data)
    var privKey = wallet.getPrivateKey()
    var msgSig = ethUtil.ecsign(new Buffer(message, 'hex'), privKey)
    var rawMsgSig = ethUtil.bufferToHex(sigUtil.concatSig(msgSig.v, msgSig.r, msgSig.s))
    return Promise.resolve(rawMsgSig)
  }

  // For personal_sign, we need to prefix the message:
  signPersonalMessage (withAccount, msgHex) {
    const wallet = this._getWalletForAccount(withAccount)
    const privKey = ethUtil.stripHexPrefix(wallet.getPrivateKey())
    const privKeyBuffer = new Buffer(privKey, 'hex')
    const sig = sigUtil.personalSign(privKeyBuffer, { data: msgHex })
    return Promise.resolve(sig)
  }

  // personal_signTypedData, signs data along with the schema
  signTypedData (withAccount, typedData) {
    const wallet = this._getWalletForAccount(withAccount)
    const privKey = ethUtil.toBuffer(wallet.getPrivateKey())
    const signature = sigUtil.signTypedData(privKey, { data: typedData })
    return Promise.resolve(signature)
  }

  // For eth_sign, we need to sign transactions:
  newGethSignMessage (withAccount, msgHex) {
    const wallet = this._getWalletForAccount(withAccount)
    const privKey = wallet.getPrivateKey()
    const msgBuffer = ethUtil.toBuffer(msgHex)
    const msgHash = ethUtil.hashPersonalMessage(msgBuffer)
    const msgSig = ethUtil.ecsign(msgHash, privKey)
    const rawMsgSig = ethUtil.bufferToHex(sigUtil.concatSig(msgSig.v, msgSig.r, msgSig.s))
    return Promise.resolve(rawMsgSig)
  }

  exportAccount (address) {
    const wallet = this._getWalletForAccount(address)
    return Promise.resolve(wallet.getPrivateKey().toString('hex'))
  }


  /* PRIVATE METHODS */

  _initFromMnemonic (mnemonic) {
    this.mnemonic = mnemonic
    const seed = bip39.mnemonicToSeed(mnemonic)
    this.hdWallet = hdkey.fromMasterSeed(seed)
    this.root = this.hdWallet.derivePath(this.hdPath)
  }


  _getWalletForAccount (account) {
    const targetAddress = sigUtil.normalize(account)
    return this.wallets.find((w) => {
      const address = sigUtil.normalize(w.getAddress().toString('hex'))
      return ((address === targetAddress) ||
              (sigUtil.normalize(address) === targetAddress))
    })
  }


  /* APP KEYS */
  _getWalletForAppKey (account) {
    const targetAddress = sigUtil.normalize(account)
    return this.appKeys.find((w) => {
      const address = sigUtil.normalize(w.address.toString('hex'))
      return ((address === targetAddress) ||
              (sigUtil.normalize(address) === targetAddress))
    }).account
  }

  appKey_eth_getPublicKey(hdPath) {
    if (!this.root) {
      this._initFromMnemonic(bip39.generateMnemonic())
    }
    const child = this.hdWallet.derivePath(hdPath)
    console.log("full hdPath", hdPath)    
    console.log("debug child", child)    
    const wallet = child.getWallet()
    const xPubKey = wallet.getPublicKeyString()
    console.log("publicKey", xPubKey)
    return Promise.resolve(xPubKey)    
  }

  appKey_eth_getAddress(hdPath) {
    console.log("GET Address hd-keyring")
    const previouslyCreated = this.appKeys.filter((appKey) => appKey.hdPath === hdPath)
    if (previouslyCreated[0]) {
      console.log(previouslyCreated[0])
      return Promise.resolve(previouslyCreated[0].address)
    }
    const address = this.appKey_eth_createWallet(hdPath)    
    return Promise.resolve(address)
  }
  // App keys
  appKey_eth_createWallet (hdPath) {
    if (!this.root) {
      this._initFromMnemonic(bip39.generateMnemonic())
    }
    console.log("full hdPath", hdPath)

    const newAppKey = []

    const child = this.hdWallet.derivePath(hdPath)
    console.log("debug child", child)
    const wallet = child.getWallet()
    console.log("debug wallet", wallet)
    console.log("debug pub key", wallet.getPublicKey())
    console.log("debug pub key string", wallet.getPublicKeyString())
    const hexKey = sigUtil.normalize(wallet.getAddress().toString('hex'))
    const appKey = {hdPath,
		    account: wallet,
		    address: hexKey}
    newAppKey.push(appKey)
    this.appKeys.push(appKey)
    return Promise.resolve(hexKey)
  }


  // tx is an instance of the ethereumjs-transaction class.
  appKey_eth_signTransaction (address, tx) {
    const wallet = this._getWalletForAppKey(address)
    var privKey = wallet.getPrivateKey()
    tx.sign(privKey)
    return Promise.resolve(tx)
  }

  appKey_eth_signTypedData (withAccount, typedData) {
    console.log("hd keyring controller")
    console.log(withAccount)
    console.log(typedData)
    const wallet = this._getWalletForAppKey(withAccount)
    const privKey = ethUtil.toBuffer(wallet.getPrivateKey())
    const signature = sigUtil.signTypedData(privKey, { data: typedData })
    return Promise.resolve(signature)
  }

  
}

HdKeyring.type = type
module.exports = HdKeyring
