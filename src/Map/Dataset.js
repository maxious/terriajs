/*global require,$,alert*/
"use strict";

var VarType = require('./VarType');
var Variable = require('./Variable');

var defined = require('../../third_party/cesium/Source/Core/defined');
var defaultValue = require('../../third_party/cesium/Source/Core/defaultValue');
var destroyObject = require('../../third_party/cesium/Source/Core/destroyObject');
var loadText = require('../../third_party/cesium/Source/Core/loadText');
var Rectangle = require('../../third_party/cesium/Source/Core/Rectangle');

/*!
 * Copyright(c) 2012-2013 National ICT Australia Limited (NICTA).  All rights reserved.
 */
 
/**
* Dataset is a container for table based datasets
*
* @alias Dataset
* @internalConstructor
* @constructor
*/
var Dataset = function() {
    this.noData = 1e-34;
    this.rowCount = 0;
    this.varTypeSet = {};
    this.variables = undefined;
    this.loadingData = false;
};

Dataset.prototype.hasLocationData = function () {
    return (this.varTypeSet.LON && this.varTypeSet.LAT);
};

Dataset.prototype.hasTimeData = function () {
    return (defined(this.varTypeSet.TIME));
};

/**
* Return the geographic extent of the dataset
*
* @returns {Object} The extent of the data points
*/
Dataset.prototype.getExtent = function () {
    var minPos = [0, 0, 0];
    var maxPos = [0, 0, 0];
    var type = ['LON', 'LAT', 'ALT'];
    for (var p in type) {
        if (defined(this.varTypeSet[p])) {
            minPos[p] = this.variables[this.varTypeSet[p]].minVal;
            maxPos[p] = this.variables[this.varTypeSet[p]].maxVal;
        }
    }
    return Rectangle.fromDegrees(minPos[0], minPos[1], maxPos[0], maxPos[1]);
};

/**
* Return the minimum value
*
* @returns {Float} The minimum data value
*/
Dataset.prototype.getMinVal = function () {
    if (defined(this.variables) && defined(this.varTypeSet.SCALAR)) {
        return this.variables[this.varTypeSet.SCALAR].minVal;
    }
};

/**
* Return the maximum value
*
* @returns {Float} The maximum data value
*/
Dataset.prototype.getMaxVal = function () {
    if (defined(this.variables) && defined(this.varTypeSet.SCALAR)) {
        return this.variables[this.varTypeSet.SCALAR].maxVal;
    }
};

/**
* Return the minimum time
*
* @returns {Object} The minimum time value in Cesium JulianTime
*/
Dataset.prototype.getMinTime = function () {
    if (defined(this.variables) && defined(this.varTypeSet.TIME)) {
        return this.variables[this.varTypeSet.TIME].timeVar.minVal;
    }
};

/**
* Return the maximum time
*
* @returns {Object} The maximum time value in Cesium JulianTime
*/
Dataset.prototype.getMaxTime = function () {
    if (defined(this.variables) && defined(this.varTypeSet.TIME)) {
        return this.variables[this.varTypeSet.TIME].timeVar.maxVal;
    }
};


/**
* Get a list of available scalar and enum type variables
*
* @returns {Array} An array of variables
*/
Dataset.prototype.getVarList = function () {
    var ret = [];
    for (var v in this.variables) {
        if (this.variables.hasOwnProperty(v)) {
            ret.push(v);
        }
    }
    return ret;
};

// Determine the min, max, and type of each variable
Dataset.prototype._processVariables = function () {
    this.varTypeSet = [];

    for (var id in this.variables) {
        if (this.variables.hasOwnProperty(id)) {
            var variable = this.variables[id];
            //guess var type if not set
            if (!defined(variable.varType)) {
                variable.guessVariableType(id);
            }
            if (variable.varType === VarType.TIME) {
                variable.processTimeVariable();            //calculate time variables
                //if failed then default type to scalar
                if (!defined(variable.timeVar)) {
                    variable.varType = VarType.SCALAR;
                }
            }
            if (variable.varType !== VarType.TIME) {
                variable._calculateVarMinMax();            //calculate var min/max
            }
            //deal with enumerated variables
            if (variable.varType === VarType.SCALAR && variable.minVal > variable.maxVal) {
                variable.varType = VarType.ENUM;
                variable.processEnumVariable();            //calculate enum variables
            }

            //set the varIDs
            for (var vt in VarType) {
                if (VarType.hasOwnProperty(vt)) {
                    if (!defined(this.varTypeSet[vt]) && variable.varType === VarType[vt]) {
                        this.varTypeSet[vt] = id;
                    }
                }
            }
        }
    }

    //set variable if preset
    if (this.varName && this.varName.length && this.variables[this.varName]) {
        this.varTypeSet.SCALAR = this.varName;
    }

    if (!defined(this.varTypeSet.SCALAR)) {
        this.varTypeSet.SCALAR = this.varTypeSet.ENUM;
    }
    //set point count
    this.rowCount = this.variables[this.varTypeSet.SCALAR].vals.length;
};


/**
* Load a JSON object into a dataset
*
* @param {Object} jsonTable Table data in JSON format.
*/
Dataset.prototype.loadJson = function (jsonTable) {

    if (defined(jsonTable) && jsonTable.length > 0 && jsonTable[0].length > 0) {
        //create the variable set
        this.variables = {};
        var columnNames = jsonTable[0];
        for (var c = 0; c < columnNames.length; c++) {
            var variable = new Variable();
            variable.name = columnNames[c].trim();
            for (var i = 1; i < jsonTable.length; ++i) {
                variable.vals.push(jsonTable[i][c]);
            }
            this.variables[variable.name] = variable;
        }

        //calculate variable type and min/max vals
        this._processVariables();

        if (this.varName) {
            this.setCurrentVariable(this.varName);
        }
    }

    console.log(this);

    this.loadingData = false;
};

/**
* Load text into a dataset
*
* @param {String} text Text to load as dataset
*
*/
Dataset.prototype.loadText = function (text) {
        //normalize line breaks
    text = text.replace(/\r\n|\r|\n/g, "\r\n");
    var jsonTable = $.csv.toArrays(text, {
            onParseValue: $.csv.hooks.castToScalar
        });
    this.loadJson(jsonTable);
};

/**
* Load a dataset
*
* @param {Object} description Object with the following properties:
* @param {String} [description.url] The url of the dataset
* @param {String} [description.variable] The initial variable to show
*
*/
Dataset.prototype.loadUrl = function (description) {
    description = defaultValue(description, {});

    this.dataUrl = defaultValue(description.url, this.dataUrl);
    this.varName = defaultValue(description.variable, '');

    if (!this.dataUrl) {
        return;
    }

    console.log('loading: ' + this.dataUrl);

    this.loadingData = true;
    var that = this;
    
    return loadText(this.dataUrl).then( function (text) { 
        that.loadText(text); 
    }, 
    function(err) { 
        alert('HTTP Error ' + err.statusCode + ' - ' + err.response);
    });
};

/**
* Set the current variable
*
* @param {String} [variable] The initial variable to show
*
*/
Dataset.prototype.setCurrentVariable = function (variable) {
    if (!defined(this.variables) || !this.variables[variable] || 
        this.variables[variable].vals.length === 0) {
        return;
    }
    this.varName = variable;
    if (this.varName.length && this.variables[this.varName]) {
        this.varTypeSet.SCALAR = this.varName;
    }
};

/**
* Get the current variable name
*
* @returns {Object} the current variable name
*
*/
Dataset.prototype.getCurrentVariable = function () {
    return this.varTypeSet.SCALAR;
};

/**
* Get the current variable
*
* @returns {Object} the current variable
*
*/
Dataset.prototype.getVariable = function (varName) {
    return this.variables[varName];
};

/**
* Get a data value
*
* @param {String} Variable name
* @param {Integer} Index in variable values
*
* @returns {Float} Value for the variable at that index
*/
Dataset.prototype.getDataValue = function (varName, idx) {
    var variable = this.variables[varName];
    if (!defined(variable) || !defined(variable.vals)) {
        return undefined;
    }
    if (variable.varType === VarType.ENUM) {
        return variable.enumList[variable.vals[idx]];
    }
    else if (variable.varType === VarType.TIME) {
        return variable.timeVar.vals[idx];
    }
     return variable.vals[idx];
};

/**
* Get a data row as object
*
* @param {Integer} Index of row
*
* @returns {Object} Object containing all row members
*/
Dataset.prototype.getDataRow = function (idx) {
    var rowObj = {};
    if (defined(idx)) {
        for (var id in this.variables) {
            if (this.variables.hasOwnProperty(id)) {
                rowObj[id] = this.getDataValue(id, idx);
            }
        }
    }
    return rowObj;
};

/**
* Get all of the data values
*
* @param {String} Variable name
*
* @returns {Array} Array of values for the variable
*/
Dataset.prototype.getDataValues = function (varName) {
    if (!defined(this.variables[varName]) || !defined(this.variables[varName].vals)) {
        return undefined;
    }
    return this.variables[varName].vals;
};


/**
* Get all of the enum values
*
* @param {String} Variable name
*
* @returns {Array} Array of values for the variable
*/
Dataset.prototype.getEnumValues = function (varName) {
    if (!defined(this.variables[varName]) || !defined(this.variables[varName].enumList)) {
        return undefined;
    }
    var vals = this.getDataValues(varName);
    var enumVals = [];
    for (var i = 0; i < vals.length; i++) {
        enumVals.push(this.variables[varName].enumList[vals[i]]);
    }
    return enumVals;
};
/**
* Return a boolean as to whether this is a nodata item
*
* @param {Float} ptVal The value to check
*
* @returns {Boolean} True if this is NoData
*/
Dataset.prototype.isNoData = function (ptVal) {
    function _float_equals(a, b) { return (Math.abs((a - b) / b) < 0.00001); }
    return _float_equals(this.noData, ptVal);
};

/**
* Get a set of data points and positions for the current variable
*
* @param {Integer} maxPts The maximum number of points to return
*
*/
Dataset.prototype.getPointList = function (maxPts) {

    var lon = defined(this.varTypeSet.LON) ? this.variables[this.varTypeSet.LON].vals : undefined;
    var lat = defined(this.varTypeSet.LAT) ? this.variables[this.varTypeSet.LAT].vals : undefined;
    var alt = this.varTypeSet.ALT ? this.variables[this.varTypeSet.ALT].vals : undefined;
    var vals = this.variables[this.varTypeSet.SCALAR].vals;
    var time = this.varTypeSet.TIME ? this.variables[this.varTypeSet.TIME].timeVar.vals : undefined;
    if (!defined(maxPts)) {
        maxPts = vals.length;
    }

    var ret = [];
    for (var i = 0; i < vals.length && i < maxPts; i++) {
        var rec = {val: vals[i]};
        rec.time =  time ? time[i] : undefined;
        rec.pos = [lon ? lon[i] : 0.0, lat ? lat[i] : 0.0, alt ? alt[i] : 0.0];
        rec.row = i;
        if (this.isNoData(rec.pos[0]) || this.isNoData(rec.pos[1])) {
            continue;
        }
        ret.push(rec);
    }
    return ret;
};


/**
* Destroy the object and release resources
*
*/
Dataset.prototype.destroy = function () {
    return destroyObject(this);
};

module.exports = Dataset;

