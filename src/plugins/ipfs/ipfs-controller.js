/*\
title: $:/plugins/ipfs/ipfs-controller.js
type: application/javascript
tags: $:/ipfs/core
module-type: library

IPFS Controller

\*/

;(function () {
  /*jslint node:true,browser:true*/
  /*global $tw:false*/
  'use strict'

  const EnsAction = require('$:/plugins/ipfs/ens-action.js').EnsAction
  const EnsWrapper = require('$:/plugins/ipfs/ens-wrapper.js').EnsWrapper

  const IpfsAction = require('$:/plugins/ipfs/ipfs-action.js').IpfsAction
  const IpfsBundle = require('$:/plugins/ipfs/ipfs-bundle.js').IpfsBundle
  const IpfsTiddler = require('$:/plugins/ipfs/ipfs-tiddler.js').IpfsTiddler
  const IpfsWrapper = require('$:/plugins/ipfs/ipfs-wrapper.js').IpfsWrapper

  const ipfsKeyword = 'ipfs'
  const ipnsKeyword = 'ipns'

  const name = 'ipfs-controller'

  var IpfsController = function () {
    this.ipfsClients = new Map()
    this.pin = []
    this.unpin = []
  }

  IpfsController.prototype.init = function () {
    // Init once
    if (this.once) {
      return
    }
    this.ipfsBundle = new IpfsBundle()
    this.ipfsBundle.init()
    this.ensWrapper = new EnsWrapper(this.ipfsBundle.ensLibrary)
    this.ipfsUrl = this.ipfsBundle.ipfsUrl
    this.ipfsWrapper = new IpfsWrapper(this.ipfsBundle)
    // Listener
    this.ensAction = new EnsAction()
    this.ipfsAction = new IpfsAction()
    this.ipfsTiddler = new IpfsTiddler()
    // Init
    this.ensAction.init()
    this.ipfsAction.init()
    this.ipfsTiddler.init()
    // Init once
    this.once = true
  }

  IpfsController.prototype.getLogger = function () {
    if (window.log !== undefined && window.log !== null) {
      const loggers = window.log.getLoggers()
      var log = loggers.eruda
      if (log !== undefined && log !== null) {
        return log
      }
      var log = loggers.default
      if (log !== undefined && log !== null) {
        return log
      }
    }
    return console
  }

  IpfsController.prototype.loadToBase64 = async function (url, password) {
    return await this.ipfsBundle.loadToBase64(url, password)
  }

  IpfsController.prototype.loadToUtf8 = async function (url, password) {
    return await this.ipfsBundle.loadToUtf8(url, password)
  }

  IpfsController.prototype.Base64ToUint8Array = function (b64) {
    return this.ipfsBundle.Base64ToUint8Array(b64)
  }

  IpfsController.prototype.Uint8ArrayToBase64 = function (ua) {
    return this.ipfsBundle.Uint8ArrayToBase64(ua)
  }

  IpfsController.prototype.StringToUint8Array = function (string) {
    return this.ipfsBundle.StringToUint8Array(string)
  }

  IpfsController.prototype.Utf8ArrayToStr = function (array) {
    return this.ipfsBundle.Utf8ArrayToStr(array)
  }

  IpfsController.prototype.processContent = async function (
    tiddler,
    content,
    encoding
  ) {
    if (content === undefined || content == null) {
      return null
    }
    if (encoding === undefined || encoding == null) {
      encoding = 'utf8'
    }
    var compressed = $tw.wiki.getTiddler('$:/isCompressed')
    compressed =
      compressed !== undefined &&
      compressed.fields.text !== undefined &&
      compressed.fields.text.trim() !== ''
        ? compressed.fields.text
        : 'yes'
    compressed =
      tiddler !== undefined &&
      tiddler.fields._compress !== undefined &&
      tiddler.fields._compress.trim() !== ''
        ? tiddler.fields._compress
        : compressed
    var encrypted = $tw.wiki.getTiddler('$:/isEncrypted')
    encrypted =
      encrypted !== undefined &&
      encrypted.fields.text !== undefined &&
      encrypted.fields.text.trim() !== ''
        ? encrypted.fields.text
        : 'no'
    var password =
      tiddler !== undefined &&
      tiddler.fields._password !== undefined &&
      tiddler.fields._password.trim() !== ''
        ? tiddler.fields._password
        : null
    var publicKey =
      tiddler !== undefined &&
      tiddler.fields._public_key !== undefined &&
      tiddler.fields._public_key.trim() !== ''
        ? tiddler.fields._public_key
        : null
    if (encrypted === 'yes' || password || publicKey) {
      try {
        if (publicKey || $tw.crypto.hasEncryptionKey()) {
          await this.loadEthSigUtilLibrary()
        }
        if (compressed === 'yes') {
          content = { compressed: this.deflate(content) }
          content.compressed = $tw.crypto.encrypt(
            content.compressed,
            password,
            publicKey
          )
          content.keccak256 = await this.keccak256(content.compressed)
          if (publicKey && publicKey !== $tw.crypto.currentPublicKey) {
            content.signature = await this.personalSign(content.keccak256)
          }
          content = JSON.stringify(content)
        } else {
          // https://github.com/xmaysonnave/tiddlywiki-ipfs/issues/9
          if (encoding === 'base64') {
            content = atob(content)
          }
          if (publicKey || $tw.crypto.hasEncryptionKey()) {
            content = { encrypted: content }
            content.encrypted = $tw.crypto.encrypt(
              content.encrypted,
              password,
              publicKey
            )
            content.keccak256 = await this.keccak256(content.encrypted)
            if (publicKey && publicKey !== $tw.crypto.currentPublicKey) {
              content.signature = await this.personalSign(content.keccak256)
            }
            content = JSON.stringify(content)
          } else {
            content = $tw.crypto.encrypt(content, password)
          }
        }
        content = this.StringToUint8Array(content)
      } catch (error) {
        $tw.ipfs.getLogger().error(error)
        $tw.utils.alert(name, 'Failed to process encrypted content...')
        return null
      }
    } else {
      try {
        if (compressed === 'yes') {
          content = { compressed: this.deflate(content) }
          content = JSON.stringify(content)
          content = this.StringToUint8Array(content)
        } else {
          if (encoding === 'base64') {
            content = this.Base64ToUint8Array(content)
          } else {
            content = this.StringToUint8Array(content)
          }
        }
      } catch (error) {
        $tw.ipfs.getLogger().error(error)
        $tw.utils.alert(name, 'Failed to process content...')
        return null
      }
    }
    return content
  }

  IpfsController.prototype.requestToPin = function (cid, ipnsKey, value) {
    const self = this
    return new Promise((resolve, reject) => {
      if (ipnsKey !== undefined && ipnsKey !== null) {
        self
          .resolveUrl(true, true, value)
          .then(data => {
            const { cid, resolvedUrl } = data
            if (resolvedUrl !== null && cid !== null) {
              resolve(self.addToPin(cid, resolvedUrl))
            } else {
              resolve(false)
            }
          })
          .catch(error => {
            reject(error)
          })
      } else if (cid !== undefined && cid !== null) {
        const normalizedUrl = self.normalizeUrl(`/${ipfsKeyword}/${cid}`)
        resolve(self.addToPin(cid, normalizedUrl))
      } else {
        resolve(false)
      }
    })
  }

  IpfsController.prototype.addToPin = function (cid, normalizedUrl) {
    if (cid !== undefined && cid !== null) {
      var index = this.unpin.indexOf(cid)
      if (index !== -1) {
        this.unpin.splice(index, 1)
        $tw.ipfs.getLogger().info(
          `Cancel request to Unpin:
 ${normalizedUrl}`
        )
        return false
      }
      if (this.pin.indexOf(cid) === -1) {
        this.pin.push(cid)
        $tw.ipfs.getLogger().info(
          `Request to Pin:
 ${normalizedUrl}`
        )
        return true
      }
    }
    return false
  }

  IpfsController.prototype.requestToUnpin = function (cid, ipnsKey, value) {
    const self = this
    return new Promise((resolve, reject) => {
      if ($tw.utils.getIpfsUnpin() === false) {
        resolve(false)
      }
      if (ipnsKey !== undefined && ipnsKey !== null) {
        self
          .resolveUrl(true, true, value)
          .then(data => {
            const { cid, resolvedUrl } = data
            if (resolvedUrl !== null && cid !== null) {
              resolve(self.addToUnpin(cid, resolvedUrl))
            } else {
              resolve(false)
            }
          })
          .catch(error => {
            reject(error)
          })
      } else if (cid !== undefined && cid !== null) {
        const normalizedUrl = self.normalizeUrl(`/${ipfsKeyword}/${cid}`)
        resolve(self.addToUnpin(cid, normalizedUrl))
      } else {
        resolve(false)
      }
    })
  }

  IpfsController.prototype.addToUnpin = function (cid, normalizedUrl) {
    if (cid !== undefined && cid !== null) {
      // Discard
      var index = this.pin.indexOf(cid)
      if (index !== -1) {
        this.pin.splice(index, 1)
        $tw.ipfs.getLogger().info(
          `Cancel request to Pin:
 ${normalizedUrl}`
        )
        return false
      }
      // Add to unpin
      if (this.unpin.indexOf(cid) === -1) {
        this.unpin.push(cid)
        $tw.ipfs.getLogger().info(
          `Request to unpin:
 ${normalizedUrl}`
        )
        return true
      }
    }
    return false
  }

  IpfsController.prototype.removeFromPinUnpin = function (cid, normalizedUrl) {
    if (cid !== undefined && cid !== null) {
      var index = this.pin.indexOf(cid)
      if (index !== -1) {
        this.pin.splice(index, 1)
        $tw.ipfs.getLogger().info(
          `Cancel request to Pin:
 ${normalizedUrl}`
        )
      }
      var index = this.unpin.indexOf(cid)
      if (index !== -1) {
        this.unpin.splice(index, 1)
        $tw.ipfs.getLogger().info(
          `Cancel request to Unpin:
 ${normalizedUrl}`
        )
      }
    }
  }

  IpfsController.prototype.pinToIpfs = async function (cid) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.pinToIpfs(ipfs, cid)
  }

  IpfsController.prototype.unpinFromIpfs = async function (cid) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.unpinFromIpfs(ipfs, cid)
  }

  IpfsController.prototype.addToIpfs = async function (content) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.addToIpfs(ipfs, content)
  }

  IpfsController.prototype.generateIpnsKey = async function (ipnsName) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.generateIpnsKey(ipfs, ipnsName)
  }

  IpfsController.prototype.removeIpnsKey = async function (ipnsName) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.removeIpnsKey(ipfs, ipnsName)
  }

  IpfsController.prototype.renameIpnsName = async function (
    oldIpnsName,
    newIpnsName
  ) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.renameIpnsName(ipfs, oldIpnsName, newIpnsName)
  }

  IpfsController.prototype.getIpnsIdentifiers = async function (
    identifier,
    ipnsName
  ) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.getIpnsIdentifiers(ipfs, identifier, ipnsName)
  }

  IpfsController.prototype.resolveIpnsKey = async function (ipnsKey) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.resolveIpnsKey(ipfs, ipnsKey)
  }

  IpfsController.prototype.publishIpnsName = async function (
    cid,
    ipnsKey,
    ipnsName
  ) {
    const { ipfs } = await this.getIpfsClient()
    return await this.ipfsWrapper.publishIpnsName(cid, ipfs, ipnsKey, ipnsName)
  }

  IpfsController.prototype.getIpfsBaseUrl = function () {
    return this.ipfsUrl.getIpfsBaseUrl()
  }

  IpfsController.prototype.normalizeUrl = function (value, base) {
    return this.ipfsUrl.normalizeUrl(value, base)
  }

  IpfsController.prototype.getDocumentUrl = function () {
    return this.ipfsUrl.getDocumentUrl()
  }

  IpfsController.prototype.getIpfsDefaultApi = function () {
    return this.ipfsUrl.getIpfsDefaultApi()
  }

  IpfsController.prototype.getIpfsDefaultGateway = function () {
    return this.ipfsUrl.getIpfsDefaultGateway()
  }

  IpfsController.prototype.getIpfsApiUrl = function () {
    return this.ipfsUrl.getIpfsApiUrl()
  }

  IpfsController.prototype.getIpfsGatewayUrl = function () {
    return this.ipfsUrl.getIpfsGatewayUrl()
  }

  IpfsController.prototype.resolveUrl = async function (
    resolveIpns,
    resolveEns,
    value,
    base,
    web3
  ) {
    var cid = null
    var ipnsKey = null
    var ipnsName = null
    var normalizedUrl = null
    var resolvedUrl = null
    value =
      value === undefined || value == null || value.toString().trim() === ''
        ? null
        : value.toString().trim()
    if (value == null) {
      return {
        cid: null,
        ipnsKey: null,
        ipnsName: null,
        normalizedUrl: null,
        resolvedUrl: null
      }
    }
    try {
      normalizedUrl = this.normalizeUrl(value, base)
    } catch (error) {
      // Ignore
    }
    if (normalizedUrl == null) {
      return {
        cid: null,
        ipnsKey: null,
        ipnsName: null,
        normalizedUrl: null,
        resolvedUrl: null
      }
    }
    var { cid, ipnsIdentifier, protocol } = this.decodeCid(normalizedUrl)
    if (protocol === ipnsKeyword && ipnsIdentifier !== null) {
      var { ipnsKey, ipnsName, normalizedUrl } = await this.getIpnsIdentifiers(
        ipnsIdentifier
      )
      if (resolveIpns) {
        $tw.ipfs.getLogger().info(
          `Resolving IPNS key:
 ${normalizedUrl}`
        )
        $tw.utils.alert(name, 'Resolving an IPNS key...')
        try {
          cid = await this.resolveIpnsKey(ipnsKey)
          if (cid !== null) {
            resolvedUrl = this.normalizeUrl(`/${ipfsKeyword}/${cid}`, base)
            $tw.ipfs.getLogger().info(
              `Successfully resolved IPNS key:
 ${normalizedUrl}`
            )
            $tw.utils.alert(name, 'Successfully resolved an IPNS key...')
          }
        } catch (error) {
          // Unable to resolve the key
          // It usually happen when the key is not initialized
          cid = null
          $tw.ipfs.getLogger().error(error)
          $tw.utils.alert(name, error.message)
        }
      }
    } else if (resolveEns && normalizedUrl.hostname.endsWith('.eth')) {
      var { cid, protocol, resolvedUrl } = await this.resolveEns(
        normalizedUrl.hostname,
        web3
      )
      if (protocol === 'ipns') {
        ipnsKey = cid
        cid = null
      }
    } else {
      resolvedUrl = normalizedUrl
    }
    return {
      cid: cid,
      ipnsKey: ipnsKey,
      ipnsName: ipnsName,
      normalizedUrl: normalizedUrl,
      resolvedUrl: resolvedUrl
    }
  }

  IpfsController.prototype.getUrl = function (url, base) {
    return this.ipfsUrl.getUrl(url, base)
  }

  IpfsController.prototype.isJson = function (content) {
    return this.ipfsBundle.isJson(content)
  }

  IpfsController.prototype.getIpfsClient = async function () {
    // Provider
    const ipfsProvider = $tw.utils.getIpfsProvider()
    // IPFS companion
    if (ipfsProvider === 'window') {
      const client = await this.ipfsWrapper.getWindowIpfsClient()
      return {
        ipfs: client.ipfs,
        provider: client.provider
      }
    }
    // Default, try IPFS companion
    if (ipfsProvider === 'default') {
      try {
        const client = await this.ipfsWrapper.getWindowIpfsClient()
        return {
          ipfs: client.ipfs,
          provider: client.provider
        }
      } catch (error) {
        // Ignore, fallback to HTTP
      }
    }
    // Current API URL
    const url = this.getIpfsApiUrl()
    // Check
    if (url === undefined || url == null || url.toString().trim() === '') {
      throw new Error('Undefined IPFS API URL...')
    }
    // HTTP Client
    const client = this.ipfsClients.get(url.toString())
    if (client !== undefined) {
      // Log
      $tw.ipfs.getLogger().info(`Reuse IPFS provider: "${client.provider}"`)
      // Done
      return {
        ipfs: client.ipfs,
        provider: client.provider
      }
    }
    // Build a new HTTP client
    const policy = await this.ipfsWrapper.getHttpIpfsClient(url)
    const ipfs = policy.ipfs
    const provider = policy.provider
    // Store
    this.ipfsClients.set(url.toString(), { ipfs, provider })
    // Log
    $tw.ipfs.getLogger().info(`New IPFS provider: "${policy.provider}"`)
    // Done
    return {
      ipfs: ipfs,
      provider: provider
    }
  }

  IpfsController.prototype.resolveEns = async function (ensDomain, web3) {
    if (web3 === undefined || web3 == null) {
      var { web3 } = await this.getWeb3Provider()
    }
    const { content, protocol } = await this.ensWrapper.getContentHash(
      ensDomain,
      web3
    )
    if (content !== null && protocol !== null) {
      const url = this.normalizeUrl(`/${protocol}/${content}`)
      $tw.ipfs.getLogger().info(
        `Successfully fetched ENS domain content: "${ensDomain}"
 ${url}`
      )
      return {
        cid: content,
        protocol: protocol,
        resolvedUrl: url
      }
    }
    return {
      cid: null,
      protocol: null,
      resolvedUrl: null
    }
  }

  IpfsController.prototype.setContentHash = async function (
    ensDomain,
    cid,
    web3,
    account
  ) {
    if (
      account === undefined ||
      account == null ||
      web3 === undefined ||
      web3 == null
    ) {
      var { account, web3 } = await this.getEnabledWeb3Provider()
    }
    await this.ensWrapper.setContentHash(ensDomain, cid, web3, account)
    const url = this.normalizeUrl(cid)
    $tw.ipfs.getLogger().info(
      `Successfully set ENS domain content:
 ${url}
 to: "${ensDomain}"`
    )
    return true
  }

  IpfsController.prototype.xhrToJson = async function (url) {
    return await this.ipfsBundle.xhrToJson(url)
  }

  IpfsController.prototype.decodeCid = function (pathname) {
    return this.ipfsBundle.decodeCid(pathname)
  }

  IpfsController.prototype.isCid = function (cid) {
    return this.ipfsBundle.isCid(cid)
  }

  IpfsController.prototype.cidToBase58CidV0 = function (cid, log) {
    return this.ipfsBundle.cidToBase58CidV0(cid, log)
  }

  IpfsController.prototype.cidToCidV1 = function (cid, protocol, log) {
    return this.ipfsBundle.cidToCidV1(cid, protocol, log)
  }

  IpfsController.prototype.cidToLibp2pKeyCidV1 = function (
    cid,
    multibaseName,
    log
  ) {
    return this.ipfsBundle.cidToLibp2pKeyCidV1(cid, multibaseName, log)
  }

  IpfsController.prototype.isOwner = async function (domain, web3, account) {
    return await this.ipfsBundle.isOwner(domain, web3, account)
  }

  IpfsController.prototype.personalRecover = function (message, signature) {
    return this.ipfsBundle.personalRecover(message, signature)
  }

  IpfsController.prototype.personalSign = async function (message, provider) {
    return await this.ipfsBundle.personalSign(message, provider)
  }

  IpfsController.prototype.decrypt = async function (text, provider) {
    return await this.ipfsBundle.decrypt(text, provider)
  }

  IpfsController.prototype.keccak256 = async function (text) {
    return await this.ipfsBundle.keccak256(text)
  }

  IpfsController.prototype.getPublicEncryptionKey = async function (provider) {
    return await this.ipfsBundle.getPublicEncryptionKey(provider)
  }

  IpfsController.prototype.getEthereumProvider = async function () {
    return await this.ipfsBundle.getEthereumProvider()
  }

  IpfsController.prototype.getEnabledWeb3Provider = async function () {
    return await this.ipfsBundle.getEnabledWeb3Provider()
  }

  IpfsController.prototype.getWeb3Provider = async function () {
    return await this.ipfsBundle.getWeb3Provider()
  }

  IpfsController.prototype.getEtherscanRegistry = function () {
    return this.ipfsBundle.getEtherscanRegistry()
  }

  IpfsController.prototype.getNetworkRegistry = function () {
    return this.ipfsBundle.getNetworkRegistry()
  }

  IpfsController.prototype.getENSRegistry = function () {
    return this.ipfsBundle.getENSRegistry()
  }

  IpfsController.prototype.loadErudaLibrary = async function () {
    return await this.ipfsBundle.loadErudaLibrary()
  }

  IpfsController.prototype.loadEthSigUtilLibrary = async function () {
    return await this.ipfsBundle.loadEthSigUtilLibrary()
  }

  IpfsController.prototype.deflate = function (str) {
    return this.ipfsBundle.deflate(str)
  }

  IpfsController.prototype.inflate = function (b64) {
    return this.ipfsBundle.inflate(b64)
  }

  exports.IpfsController = IpfsController
})()
