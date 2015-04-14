/*global require*/
"use strict";

/*!
 * Copyright(c) 2012-2013 National ICT Australia Limited (NICTA).  All rights reserved.
 */

var defined = require('../../third_party/cesium/Source/Core/defined');
var destroyObject = require('../../third_party/cesium/Source/Core/destroyObject');
var JulianDate = require('../../third_party/cesium/Source/Core/JulianDate');
var VarType = require('./VarType');

/**
* @class Variable contains a single variable from a table dataset
* @name Variable
*
* @alias Variable
* @internalConstructor
* @constructor
*/
var Variable = function () {
    this.vals = [];
    this.varType = undefined;
    this.noData = 1e-34;
    this.minVal = undefined;
    this.maxVal = undefined;
    this.timeVar = undefined;
    this.enumList = undefined;
};

Variable.prototype._calculateVarMinMax = function () {
    var vals = this.vals;
    var minVal = Number.MAX_VALUE;
    var maxVal = -Number.MAX_VALUE;
    for (var i = 0; i < vals.length; i++) {
        if (vals[i] === undefined || vals[i] === null) {
            vals[i] = this.noData;
        }
        else {
            if (minVal > vals[i]) {
                minVal = vals[i];
            }
            if (maxVal < vals[i]) {
                maxVal = vals[i];
            }
        }
    }
    this.minVal = minVal;
    this.maxVal = maxVal;
};

Variable.prototype._calculateTimeMinMax = function () {
    var vals = this.vals;
    var minVal = vals[0];
    var maxVal = vals[0];
    for (var i = 1; i < vals.length; i++) {
        if (JulianDate.greaterThan(minVal, vals[i])) {
            minVal = vals[i];
        }
        if (JulianDate.lessThan(maxVal, vals[i])) {
            maxVal = vals[i];
        }
    }
    this.minVal = minVal;
    this.maxVal = maxVal;
};

/**
* Convert input time variable to Cesium Time variable
*
*/
Variable.prototype.processTimeVariable = function () {
    if (this.varType !== VarType.TIME) {
        return;
    }
    
    function swapDateFormat(v) {
        var part = v.split(/[/-]/);
        if (part.length === 3) {
            v = part[1] + '/' + part[0] + '/' + part[2];
        }
        return v;
    }

    //create new Cessium time variable to attach to the variable
    var timeVar = new Variable();
    var vals = this.vals;

    //parse the time values trying iso and javascript date parsing
    var bSuccess = false;
    try {
        for (var i = 0; i < vals.length; i++) {
            timeVar.vals[i] = JulianDate.fromIso8601(vals[i]);
        }
        bSuccess = true;
    }
    catch (err) {
        console.log('Trying Javascript Date.parse');
        timeVar.vals = [];
        try {
            for (var i = 0; i < vals.length; i++) {
                timeVar.vals[i] = JulianDate.fromDate(new Date(vals[i].toString()));
            }
            bSuccess = true;
        }
        catch (err) {
            console.log('Trying swap of day and month in date strings');
            timeVar.vals = [];
            try {
                for (var i = 0; i < vals.length; i++) {
                    timeVar.vals[i] = JulianDate.fromDate(new Date(swapDateFormat(vals[i])));
                }
                bSuccess = true;
            }
            catch (err) {
            }
        }
    }
    if (bSuccess) {
        timeVar._calculateTimeMinMax();
        this.timeVar = timeVar;
    }
    else {
        this.varType = VarType.SCALAR;
        console.log('Unable to parse time variable');
    }
};


/**
* Convert input enum variable to values and enumList
*
*/
Variable.prototype.processEnumVariable = function () {
    if (this.varType !== VarType.ENUM) {
        return;
    }
    //create new enum list for the variable
    var enumList = [];
    var enumHash = {};
    for (var i = 0; i < this.vals.length; i++) {
        if (this.vals[i] === this.noData) {
            this.vals[i] = 'undefined';
        }
        var n = enumHash[this.vals[i]];
        if (!defined(n)) {
            n = enumList.length;
            enumList.push(this.vals[i]);
            enumHash[this.vals[i]] = n;
        }
        this.vals[i] = n;
    }
    this.enumList = enumList;
    this._calculateVarMinMax();
};


/**
* Based on variable name, guess what the VarType should be
*
* @param {String} name Make an initial guess at the variable type based on its name
*
*/
Variable.prototype.guessVariableType = function (name) {
    //functions to try to figure out position and time variables.
    function matchColumn(name, hints) {
        name = name.toLowerCase();
        for (var h in hints) {
            if (hints.hasOwnProperty(h)) {
                var hint = hints[h].toLowerCase();
                if (name.indexOf(hint) === 0 || name.indexOf(' ' + hint) !== -1 || name.indexOf('_' + hint) !== -1) {
                    return true;
                }
            }
        }
        return false;
    }

    var hintSet = [
        { hints: ['lon'], type: VarType.LON },
        { hints: ['lat'], type: VarType.LAT },
        { hints: ['depth', 'height', 'elevation'], type: VarType.ALT },
        { hints: ['time', 'date', 'year'], type: VarType.TIME }];    //UN Global Risk

    for (var vt in hintSet) {
        if (matchColumn(name, hintSet[vt].hints)) {
            this.varType = hintSet[vt].type;
            return;
        }
    }
    this.varType = VarType.SCALAR;
};

/**
* Destroy the object and release resources
*
*/
Variable.prototype.destroy = function () {
    return destroyObject(this);
};

module.exports = Variable;



