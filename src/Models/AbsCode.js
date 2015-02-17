"use strict";

/*global require*/

var defineProperties = require('../../third_party/cesium/Source/Core/defineProperties');
var knockout = require('../../third_party/cesium/Source/ThirdParty/knockout');

var AbsCode = function(name, value) {
    /**
     * Gets or sets the name of the abs code.  This property is observable.
     * @type {String}
     */
    this.name = name;

    /**
     * Gets or sets the value of the abs code.
     * @type {String}
     */
    this.code = value;

    /**
     * Gets the list of abs codes contained in this group.  This property is observable.
     * @type {AbsCode[]}
     */
    this.items = [];

    /**
     * Gets or sets a value indicating whether this abs code is currently open.  When an
     * item is open, its child items (if any) are visible.  This property is observable.
     * @type {Boolean}
     */
    this.isOpen = true;

    /**
     * Gets or sets a value indicating whether this abs code is currently active.  When a
     * code is active, it is included in the abs data query.  This property is observable.
     * @type {Boolean}
     */
    this.isActive = false;
    this.isCode = true;

    knockout.track(this, ['name', 'code', 'items', 'isOpen', 'isActive', 'isCode']);
};

defineProperties(AbsCode.prototype, {
    /**
     * Gets a value indicating whether this item has child items.
     * @type {Boolean}
     */
    hasChildren : {
        get : function() {
            return this.items.length > 0;
        }
    }

});

/**
 * Toggles the {@link AbsCode#isOpen} property.  If this item's list of children is open,
 * calling this method will close it.  If the list is closed, calling this method will open it.
 */
AbsCode.prototype.toggleOpen = function() {
    this.isOpen = !this.isOpen;
};

/**
 * Toggles the {@link AbsCode#isActive} property.
 */
AbsCode.prototype.toggleActive = function() {
    this.isActive = !this.isActive;
};

module.exports = AbsCode;
