/*\
title: $:/core/modules/saver-handler.js
type: application/javascript
module-type: global

The saver handler tracks changes to the store and handles saving the entire wiki via saver modules.

\*/
(function() {
  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";

  /*
Instantiate the saver handler with the following options:
wiki: wiki to be synced
dirtyTracking: true if dirty tracking should be performed
*/
  function SaverHandler(options) {
    var self = this;
    this.wiki = options.wiki;
    this.dirtyTracking = options.dirtyTracking;
    this.preloadDirty = options.preloadDirty || [];
    this.pendingAutoSave = false;
    // Make a logger
    this.logger = new $tw.utils.Logger("saver-handler");
    // Initialise our savers
    if ($tw.browser) {
      this.initSavers();
    }
    // Only do dirty tracking if required
    if ($tw.browser && this.dirtyTracking) {
      // Compile the dirty tiddler filter
      this.filterFn = this.wiki.compileFilter(this.wiki.getTiddlerText(this.titleSyncFilter));
      // Count of changes that have not yet been saved
      var filteredChanges = self.filterFn.call(self.wiki, function(iterator) {
        $tw.utils.each(self.preloadDirty, function(title) {
          var tiddler = self.wiki.getTiddler(title);
          iterator(tiddler, title);
        });
      });
      this.numChanges = filteredChanges.length;
      // Listen out for changes to tiddlers
      this.wiki.addEventListener("change", async function(changes) {
        // Filter the changes so that we only count changes to tiddlers that we care about
        var filteredChanges = self.filterFn.call(self.wiki, function(iterator) {
          $tw.utils.each(changes, function(change, title) {
            var tiddler = self.wiki.getTiddler(title);
            iterator(tiddler, title);
          });
        });
        // Adjust the number of changes
        self.numChanges += filteredChanges.length;
        self.updateDirtyStatus();
        // Do any autosave if one is pending and there's no more change events
        if (self.pendingAutoSave && self.wiki.getSizeOfTiddlerEventQueue() === 0) {
          // Check if we're dirty
          if (self.numChanges > 0) {
            await self.saveWiki({
              method: "autosave",
              downloadType: "text/plain"
            });
          }
          self.pendingAutoSave = false;
        }
      });
      // Listen for the autosave event
      $tw.rootWidget.addEventListener("tm-auto-save-wiki", async function(event) {
        // Do the autosave unless there are outstanding tiddler change events
        if (self.wiki.getSizeOfTiddlerEventQueue() === 0) {
          // Check if we're dirty
          if (self.numChanges > 0) {
            await self.saveWiki({
              method: "autosave",
              downloadType: "text/plain"
            });
          }
        } else {
          // Otherwise put ourselves in the "pending autosave" state and wait for the change event before we do the autosave
          self.pendingAutoSave = true;
        }
      });
      // Set up our beforeunload handler
      $tw.addUnloadTask(function(event) {
        var confirmationMessage;
        if (self.isDirty()) {
          confirmationMessage = $tw.language.getString("UnsavedChangesWarning");
          event.returnValue = confirmationMessage; // Gecko
        }
        return confirmationMessage;
      });
    }
    // Install the save action handlers
    if ($tw.browser) {
      $tw.rootWidget.addEventListener("tm-save-wiki", async function(event) {
        await self.saveWiki({
          template: event.param,
          downloadType: "text/plain",
          variables: event.paramObject
        });
      });
      $tw.rootWidget.addEventListener("tm-download-file", async function(event) {
        await self.saveWiki({
          method: "download",
          template: event.param,
          downloadType: "text/plain",
          variables: event.paramObject
        });
      });
    }
  }

  SaverHandler.prototype.titleSyncFilter = "$:/config/SaverFilter";
  SaverHandler.prototype.titleAutoSave = "$:/config/AutoSave";
  SaverHandler.prototype.titleSavedNotification = "$:/language/Notifications/Save/Done";

  /*
Select the appropriate saver modules and set them up
*/
  SaverHandler.prototype.initSavers = function(moduleType) {
    moduleType = moduleType || "saver";
    // Instantiate the available savers
    this.savers = [];
    const self = this;
    $tw.modules.forEachModuleOfType(moduleType, function(title, module) {
      if (module.canSave(self)) {
        self.savers.push({ title: title, module: module.create(self.wiki) });
      }
    });
    // Sort savers
    this.sortSavers();
  };

  /*
   * Update a saver priority
   */
  SaverHandler.prototype.updateSaver = function(title, priority) {
    if (priority !== undefined && title !== undefined) {
      // Locate saver
      var saver = this.locateSaver(title);
      if (saver !== undefined && saver != null) {
        // Update saver priority info
        saver.info.priority = priority;
        // Sort savers
        this.sortSavers();
      }
    }
  };

  /*
   * Sort the savers into priority order
   */
  SaverHandler.prototype.sortSavers = function() {
    this.savers.sort(function(a, b) {
      if (a.module.info.priority < b.module.info.priority) {
        return -1;
      } else {
        if (a.module.info.priority > b.module.info.priority) {
          return +1;
        } else {
          return 0;
        }
      }
    });
  };

  /*
Save the wiki contents. Options are:
method: "save", "autosave" or "download"
template: the tiddler containing the template to save
downloadType: the content type for the saved file
*/
  SaverHandler.prototype.saveWiki = async function(options) {
    options = options || {};
    var self = this,
      method = options.method || "save";
    // Ignore autosave if disabled
    if (method === "autosave" && this.wiki.getTiddlerText(this.titleAutoSave, "yes") !== "yes") {
      return false;
    }
    var variables = options.variables || {},
      template = options.template || "$:/core/save/all",
      downloadType = options.downloadType || "text/plain",
      text = this.wiki.renderTiddler(downloadType, template, options),
      callback = function(err) {
        if (err) {
          self.logger.alert($tw.language.getString("Error/WhileSaving") + ": " + err);
        } else {
          // Clear the task queue if we're saving (rather than downloading)
          if (method !== "download") {
            self.numChanges = 0;
            self.updateDirtyStatus();
          }
          $tw.notifier.display(self.titleSavedNotification);
          if (options.callback) {
            options.callback();
          }
        }
      };

    // Prepare enabled preferred saver if any
    var enabled = [];
    var preferredSuccess = false;
    for (var i in this.savers) {
      const current = $tw.wiki.getTiddler("$:/config/PreferredSaver/" + this.savers[i].title);
      if (current !== undefined && current !== null) {
        const value = current.getFieldString("text");
        if (value !== undefined && value !== null && value.trim() === "enable") {
          enabled.push(this.savers[i]);
        }
      }
    }
    // Process preferred if any
    for (var i = enabled.length - 1; i >= 0; i--) {
      // Process preferred saver
      if (await this.save(enabled[i].module, method, variables, text, callback)) {
        // At least one preferred saver has been successfully processed
        preferredSuccess = true;
        // Remove processed element
        enabled.length = i;
      }
    }

    // At least one preferred saver has been successfully processed
    if (preferredSuccess) {
      return true;
    }

    // Call the highest priority saver that supports this method
    for (var t = this.savers.length - 1; t >= 0; t--) {
      // Ignore non successfully processed preferred
      if (enabled.includes(this.savers[t])) {
        continue;
      }
      // Process
      if (await this.save(this.savers[t].module, method, variables, text, callback)) {
        return true;
      }
    }
    return false;
  };

  SaverHandler.prototype.locateSaver = function(name) {
    // Locate saver
    var saver = null;
    for (var i = 0; i < this.savers.length; i++) {
      const current = this.savers[i];
      if (current.title === name) {
        saver = current;
        break;
      }
    }
    return saver;
  };

  SaverHandler.prototype.save = async function(saver, method, variables, text, callback) {
    if (
      saver.info.capabilities.indexOf(method) !== -1 &&
      (await saver.save(text, method, callback, {
        variables: { filename: variables.filename }
      }))
    ) {
      this.logger.log("Saved wiki with method", method, "through saver", saver.info.name);
      return true;
    }
    return false;
  };

  /*
Checks whether the wiki is dirty (ie the window shouldn't be closed)
*/
  SaverHandler.prototype.isDirty = function() {
    return this.numChanges > 0;
  };

  /*
Update the document body with the class "tc-dirty" if the wiki has unsaved/unsynced changes
*/
  SaverHandler.prototype.updateDirtyStatus = function() {
    if ($tw.browser) {
      $tw.utils.toggleClass(document.body, "tc-dirty", this.isDirty());
    }
  };

  exports.SaverHandler = SaverHandler;
})();
