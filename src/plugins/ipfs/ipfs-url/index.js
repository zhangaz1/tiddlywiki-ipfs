;(function () {
  'use strict'

  /*eslint no-unused-vars:"off"*/
  const name = 'ipfs-url'

  var IpfsUrl = function (ipfsBundle) {
    this.ipfsBundle = ipfsBundle
  }

  IpfsUrl.prototype.getLogger = function () {
    return this.ipfsBundle.getLogger()
  }

  IpfsUrl.prototype.getIpfsDefaultApiUrl = function () {
    return new URL(this.getIpfsDefaultApi())
  }

  IpfsUrl.prototype.getIpfsDefaultGatewayUrl = function () {
    return new URL(this.getIpfsDefaultGateway())
  }

  IpfsUrl.prototype.getIpfsApiUrl = function () {
    try {
      return this.getUrl($tw.utils.getIpfsSaverApiUrl())
    } catch (error) {
      return this.getIpfsDefaultApiUrl()
    }
  }

  IpfsUrl.prototype.getIpfsGatewayUrl = function () {
    try {
      return this.getUrl($tw.utils.getIpfsSaverGatewayUrl())
    } catch (error) {
      return this.getIpfsDefaultGatewayUrl()
    }
  }

  IpfsUrl.prototype.getIpfsDefaultApi = function () {
    return 'https://ipfs.infura.io:5001'
  }

  IpfsUrl.prototype.getIpfsDefaultGateway = function () {
    return 'https://ipfs.infura.io'
  }

  /**
   * url.href;
   * url.origin
   * url.protocol;
   * url.username;
   * url.password;
   * url.host;
   * url.hostname;
   * url.port;
   * url.pathname;
   * url.search;
   * url.hash;
   * https://jsdom.github.io/whatwg-url/
   * https://github.com/stevenvachon/universal-url
   * https://github.com/stevenvachon/universal-url-lite
   * https://url.spec.whatwg.org/
   */
  IpfsUrl.prototype.getDocumentUrl = function () {
    try {
      return new URL(globalThis.location.href)
    } catch (error) {
      this.getLogger().error(error)
    }
    throw new Error('Invalid current HTML Document URL...')
  }

  IpfsUrl.prototype.getUrl = function (url, base) {
    try {
      if (url instanceof URL) {
        return new URL(url.href, base)
      }
      return new URL(url, base)
    } catch (error) {
      // Ignore
    }
    throw new Error('Invalid URL...')
  }

  IpfsUrl.prototype.getIpfsBaseUrl = function () {
    var base = this.getIpfsGatewayUrl()
    try {
      if ($tw.utils.getIpfsUrlPolicy() === 'origin') {
        base = this.getDocumentUrl()
      }
    } catch (error) {
      base = this.getIpfsGatewayUrl()
    }
    return this.getUrl(base)
  }

  IpfsUrl.prototype.getBase = function (base) {
    var url = null
    var value =
      base === undefined || base == null || base.toString().trim() === ''
        ? null
        : base.toString().trim()
    if (value == null) {
      return this.getIpfsBaseUrl()
    }
    try {
      url = this.getUrl(value)
    } catch (error) {
      return this.getIpfsBaseUrl()
    }
    // Parse
    var hostname
    var identifier
    var protocol
    const members = url.hostname.split('.')
    for (var i = 0; i < members.length; i++) {
      // Ignore
      if (members[i].trim() === '') {
        continue
      }
      // First non empty member
      if (!identifier) {
        identifier = members[i]
        continue
      }
      // Second non empty member
      if (!protocol) {
        protocol = members[i]
        continue
      }
      if (hostname) {
        hostname = `${hostname}.${members[i]}`
      } else {
        hostname = members[i]
      }
    }
    if (!protocol || !identifier) {
      return base
    }
    if (protocol !== 'ipfs' && protocol !== 'ipns') {
      return base
    }
    const host = url.port ? `${hostname}:${url.port}` : hostname
    return this.getUrl(`${url.protocol}//${host}`)
  }

  IpfsUrl.prototype.normalizeUrl = function (value, base) {
    value =
      value === undefined || value == null || value.toString().trim() === ''
        ? null
        : value.toString().trim()
    if (value == null) {
      return null
    }
    base = this.getBase(base)
    // Parse
    var url = null
    // Text or URL
    try {
      url = this.getUrl(value)
    } catch (error) {
      if (
        value.startsWith('/') === false &&
        value.startsWith('./') === false &&
        value.startsWith('../') === false
      ) {
        var text = true
        try {
          url = this.getUrl(`https://${value}`)
          if (
            url.hostname.endsWith('.eth') === false &&
            url.hostname.endsWith('.eth.link') === false
          ) {
            url = null
          } else {
            text = false
          }
        } catch (error) {
          // ignore
        }
        if (text) {
          return null
        }
      }
    }
    // Invalid URL, try to parse with a Base URL
    if (url == null) {
      url = this.getUrl(value, base)
    } else if (url.protocol === 'ipfs:' || url.protocol === 'ipns:') {
      const protocol = url.protocol.slice(0, -1)
      if (
        url.hostname !== undefined &&
        url.hostname !== null &&
        url.hostname.trim() !== ''
      ) {
        base.pathname = `/${protocol}/${url.hostname}`
      } else if (
        url.pathname !== undefined &&
        url.pathname !== null &&
        url.pathname.trim() !== ''
      ) {
        if (url.pathname.startsWith('//')) {
          base.pathname = `/${protocol}/${url.pathname.slice(2)}`
        } else {
          base.pathname = `/${protocol}/${url.pathname}`
        }
      }
      base.username = url.username
      base.password = url.password
      base.search = url.search
      base.hash = url.hash
      url = base
    }
    // Remove .link from .eth.link
    if (url.hostname.endsWith('.eth.link')) {
      url.hostname = url.hostname.substring(0, url.hostname.indexOf('.link'))
    }
    return url
  }

  module.exports = IpfsUrl
})()
