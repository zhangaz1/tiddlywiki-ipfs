/*\
title: $:/plugins/ipfs/modules/widgets/image.js
type: application/javascript
module-type: widget

The image widget displays an image referenced with an external URI or with a local tiddler title.

```
<$image src="TiddlerTitle" width="320" height="400" class="classnames">
```

The image source can be the title of an existing tiddler or the URL of an external image.

External images always generate an HTML `<img>` tag.

Tiddlers that have a _canonical_uri field generate an HTML `<img>` tag with the src attribute containing the URI.

Tiddlers that contain image data generate an HTML `<img>` tag with the src attribute containing a base64 representation of the image.

Tiddlers that contain wikitext could be rendered to a DIV of the usual size of a tiddler, and then transformed to the size requested.

The width and height attributes are interpreted as a number of pixels, and do not need to include the "px" suffix.

\*/

/**
 * TiddlyWiki created by Jeremy Ruston, (jeremy [at] jermolene [dot] com)
 *
 * Copyright (c) 2004-2007, Jeremy Ruston
 * Copyright (c) 2007-2018, UnaMesa Association
 * Copyright (c) 2019-2020, Blue Light
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of the copyright holder nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS'
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

const name = "ipfs-image";

var ImageWidget = function(parseTreeNode,options) {
  this.initialise(parseTreeNode,options);
};

ImageWidget.prototype.getLogger = function() {
  if (window.log) {
    return window.log.getLogger(name);
  }
  return console;
}

/*
Inherit from the base widget class
*/
ImageWidget.prototype = new Widget();

/*
Render this widget into the DOM
*/
ImageWidget.prototype.render = function(parent,nextSibling) {
  const self = this;
  this.parentDomNode = parent;
  this.computeAttributes();
  this.execute();
  // Create element
  // Determine what type of image it is
  var tiddler = this.wiki.getTiddler(this.imageSource);
  // Create default element
  var domNode = this.document.createElement("img");
  if(!tiddler) {
    // The source isn't the title of a tiddler, so we'll assume it's a URL
    domNode.setAttribute(
      "src",
      this.getVariable("tv-get-export-image-link",{params: [{name: "src",value: this.imageSource}],defaultValue: this.imageSource})
    );
  } else {
    // Check if it is an image tiddler
    if(this.wiki.isImageTiddler(this.imageSource)) {
      var type = tiddler.fields.type;
      var text = tiddler.fields.text;
      var _canonical_uri = tiddler.fields._canonical_uri;
      // If the tiddler has body text then it doesn't need to be lazily loaded
      if(text) {
        // Render the appropriate element for the image type
        switch(type) {
          case "application/pdf":
            domNode = this.document.createElement("embed");
            domNode.setAttribute("src", "data:application/pdf;base64," + text);
            break;
          case "image/svg+xml":
            domNode.setAttribute("src", "data:image/svg+xml," + encodeURIComponent(text));
            break;
          default:
            domNode.setAttribute("src", "data:" + type + ";base64," + text);
            break;
        }
      } else if(_canonical_uri) {
        // Normalize
        var uri = _canonical_uri;
        $tw.ipfs.normalizeIpfsUrl(uri)
        .then( (uri) => {
          // Process
          switch(type) {
            case "application/pdf":
              domNode = this.document.createElement("embed");
              $tw.utils.loadToBase64(uri)
              .then( (loaded) => {
                domNode.setAttribute("src", "data:application/pdf;base64," + loaded.data);
              })
              .catch( (error) => {
                self.getLogger().error(error);
                $tw.utils.alert(name, error.message);
              });
              break;
            case "image/svg+xml":
              $tw.utils.loadToUtf8(uri)
              .then( (loaded) => {
                domNode.setAttribute("src", "data:image/svg+xml," + encodeURIComponent(loaded.data));
              })
              .catch( (error) => {
                self.getLogger().error(error);
                $tw.utils.alert(name, error.message);
              });
              break;
            default:
              $tw.utils.loadToBase64(uri)
              .then( (loaded) => {
                domNode.setAttribute("src", "data:" + type + ";base64," + loaded.data);
              })
              .catch( (error) => {
                self.getLogger().error(error);
                $tw.utils.alert(name, error.message);
              });
              break;
          }
        })
        .catch( (error) => {
          self.getLogger().error(error);
          $tw.utils.alert(name, error.message);
        });
      } else {
        // Just trigger loading of the tiddler
        this.wiki.getTiddlerText(this.imageSource);
        domNode.setAttribute("src","");
      }
    }
  }
  // Assign the attributes
  if(this.imageClass) {
    domNode.setAttribute("class",this.imageClass);
  }
  if(this.imageWidth) {
    domNode.setAttribute("width",this.imageWidth);
  }
  if(this.imageHeight) {
    domNode.setAttribute("height",this.imageHeight);
  }
  if(this.imageTooltip) {
    domNode.setAttribute("title",this.imageTooltip);
  }
  if(this.imageAlt) {
    domNode.setAttribute("alt",this.imageAlt);
  }
  // Insert element
  parent.insertBefore(domNode,nextSibling);
  this.domNodes.push(domNode);
};

/*
Compute the internal state of the widget
*/
ImageWidget.prototype.execute = function() {
  // Get our parameters
  this.imageSource = this.getAttribute("source");
  this.imageWidth = this.getAttribute("width");
  this.imageHeight = this.getAttribute("height");
  this.imageClass = this.getAttribute("class");
  this.imageTooltip = this.getAttribute("tooltip");
  this.imageAlt = this.getAttribute("alt");
};

/*
Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
*/
ImageWidget.prototype.refresh = function(changedTiddlers) {
  var changedAttributes = this.computeAttributes();
  if(changedAttributes.source || changedAttributes.width || changedAttributes.height || changedAttributes["class"] || changedAttributes.tooltip || changedTiddlers[this.imageSource]) {
    this.refreshSelf();
    return true;
  } else {
    return false;
  }
};

exports.image = ImageWidget;

})();
