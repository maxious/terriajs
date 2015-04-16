'use strict';

/*global require*/
var defaultValue = require('../../third_party/cesium/Source/Core/defaultValue');
var defined = require('../../third_party/cesium/Source/Core/defined');
var DeveloperError = require('../../third_party/cesium/Source/Core/DeveloperError');
var knockout = require('../../third_party/cesium/Source/ThirdParty/knockout');

var loadView = require('../Core/loadView');
var ViewerMode = require('../Models/ViewerMode');

var SettingsPanelViewModel = function(options) {
    if (!defined(options) || !defined(options.application)) {
        throw new DeveloperError('options.application is required.');
    }

    this.application = options.application;

    this._domNodes = undefined;

    this.isVisible = defaultValue(options.isVisible, true);
    this.baseMaps = [];
    this.mouseOverBaseMap = undefined;

    knockout.track(this, ['isVisible', 'baseMaps', 'mouseOverBaseMap']);

    knockout.getObservable(this, 'isVisible').subscribe(function(e) {
        updateDocumentSubscription(this);
    }, this);

    updateDocumentSubscription(this);
};

SettingsPanelViewModel.prototype.show = function(container) {
    if (!defined(this._domNodes)) {
        this._domNodes = loadView(require('fs').readFileSync(__dirname + '/../Views/SettingsPanel.html', 'utf8'), container, this);
    }
};

SettingsPanelViewModel.prototype.close = function() {
    this.isVisible = false;
};

SettingsPanelViewModel.prototype.closeIfClickOnBackground = function(viewModel, e) {
    if (e.target.className === 'settings-panel-background') {
        this.close();
    }
    return true;
};

SettingsPanelViewModel.prototype.select2D = function() {
    this.application.viewerMode = ViewerMode.Leaflet;
};

SettingsPanelViewModel.prototype.select3DSmooth = function() {
    this.application.viewerMode = ViewerMode.CesiumEllipsoid;
};

SettingsPanelViewModel.prototype.select3DTerrain = function() {
    this.application.viewerMode = ViewerMode.CesiumTerrain;
};

SettingsPanelViewModel.prototype.changeHighlightedBaseMap = function(baseMap) {
    this.mouseOverBaseMap = baseMap;
};

SettingsPanelViewModel.prototype.selectBaseMap = function(baseMap) {
    this.application.baseMap = baseMap.catalogItem;
};

SettingsPanelViewModel.prototype.resetHightedBaseMap = function() {
    this.mouseOverBaseMap = undefined;
};

function updateDocumentSubscription(viewModel) {
    if (viewModel.isVisible && !defined(viewModel._closeOnInteraction)) {
        viewModel._closeOnInteraction = function(e) {
            var isClickOutside = true;
            if (defined(e) && defined(viewModel._domNodes)) {
                var element = e.target;
                while (isClickOutside && element) {
                    isClickOutside = viewModel._domNodes.indexOf(element) < 0 && (!defined(element.className) || !defined(element.className.indexOf) || element.className.indexOf('menu-bar-item') < 0);
                    element = element.parentNode;
                }
            }

            if (isClickOutside) {
                viewModel.close();
            }
        };
        document.addEventListener('mousedown', viewModel._closeOnInteraction, true);
        document.addEventListener('touchstart', viewModel._closeOnInteraction, true);
        document.addEventListener(getWheelEventName(), viewModel._closeOnInteraction, true);

        if (defined(window.PointerEvent)) {
            document.addEventListener('pointerdown', viewModel._closeOnInteraction, true);
        }
    } else if (!viewModel.isVisible && defined(viewModel._closeOnInteraction)) {
        document.removeEventListener('mousedown', viewModel._closeOnInteraction, true);
        document.removeEventListener('touchstart', viewModel._closeOnInteraction, true);
        document.removeEventListener(getWheelEventName(), viewModel._closeOnInteraction, true);

        if (defined(window.PointerEvent)) {
            document.removeEventListener('pointerdown', viewModel._closeOnInteraction, true);
        }

        viewModel._closeOnInteraction = undefined;
    }
}

function getWheelEventName() {
    if ('onwheel' in document) {
        // spec event type
        return 'wheel';
    } else if (defined(document.onmousewheel)) {
        // legacy event type
        return 'mousewheel';
    } else {
        // older Firefox
        return 'DOMMouseScroll';
    }
}

module.exports = SettingsPanelViewModel;