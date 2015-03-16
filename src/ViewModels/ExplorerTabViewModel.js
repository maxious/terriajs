'use strict';

/*global require*/
var defaultValue = require('../../third_party/cesium/Source/Core/defaultValue');
var defined = require('../../third_party/cesium/Source/Core/defined');
var DeveloperError = require('../../third_party/cesium/Source/Core/DeveloperError');
var knockout = require('../../third_party/cesium/Source/ThirdParty/knockout');

var ExplorerTabViewModel = function(name) {
    this.panel = undefined;

    this.name = defaultValue(name, 'Unknown');
    this.badgeText = undefined;
    this.badgeIsPopped = false;
    this.isVisible = true;
    this.isActive = false;

    this._popTimeoutID = undefined;

    knockout.track(this, ['name', 'badgeText', 'badgeIsPopped', 'isVisible', 'isActive']);
};

ExplorerTabViewModel.prototype.activate = function() {
    if (!defined(this.panel)) {
        throw new DeveloperError('This tab must be added to the explorer panel before it can be activated.');
    }

    this.panel.activateTab(this);
};

ExplorerTabViewModel.prototype.popBadge = function() {
    // Reset the popped state.  It might still be true if the pop was previously aborted.
    this.badgeIsPopped = false;

    // Delay the pop slightly, in case the badge just appeared.
    if (!defined(this._popTimeoutID)) {
        var that = this;
        this._popTimeoutID = setTimeout(function() {
            that._popTimeoutID = undefined;
            that.badgeIsPopped = true;
        }, 50);
    }
};

ExplorerTabViewModel.prototype.unpopBadge = function() {
    if (defined(this._popTimeoutID)) {
        clearTimeout(this._popTimeoutID);
        this._popTimeoutID = undefined;
    }
    this.badgeIsPopped = false;
};

module.exports = ExplorerTabViewModel;
