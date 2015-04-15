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
    this.activeVarSet = {};
    this.variables = {};
    this.loadingData = false;
};

/**
* Determine if dataset has location data
*
* @returns {Boolean} True if a lat and lon variables are present
*/
Dataset.prototype.hasLocationData = function () {
    return (this.activeVarSet.LON && this.activeVarSet.LAT);
};

/**
* Determine if dataset has time data
*
* @returns {Boolean} True if a time variable is present
*/
Dataset.prototype.hasTimeData = function () {
    return (defined(this.activeVarSet.TIME));
};

/**
* Return the geographic extent of the dataset
*
* @returns {Object} The extent of the data points
*/
Dataset.prototype.getExtent = function () {
    var lonVar = this.variables[this.activeVarSet.LON];
    var latVar = this.variables[this.activeVarSet.LAT];
    if (defined(lonVar) && defined(latVar)) {
        Rectangle.fromDegrees(lonVar.minVal, latVar.minVal, lonVar.maxVal, latVar.maxVal);
    }
};

/**
* Return the minimum time
*
* @returns {Object} The minimum time value in Cesium JulianTime
*/
Dataset.prototype.getMinTime = function () {
    if (defined(this.activeVarSet.TIME)) {
        return this.variables[this.activeVarSet.TIME].timeVar.minVal;
    }
};

/**
* Return the maximum time
*
* @returns {Object} The maximum time value in Cesium JulianTime
*/
Dataset.prototype.getMaxTime = function () {
    if (defined(this.activeVarSet.TIME)) {
        return this.variables[this.activeVarSet.TIME].timeVar.maxVal;
    }
};

/**
* Return the minimum value
*
* @returns {Float} The minimum data value
*/
Dataset.prototype.getMinDataValue = function () {
    if (defined(this.activeVarSet.DATA)) {
        return this.variables[this.activeVarSet.DATA].minVal;
    }
};

/**
* Return the maximum value
*
* @returns {Float} The maximum data value
*/
Dataset.prototype.getMaxDataValue = function () {
    if (defined(this.activeVarSet.DATA)) {
        return this.variables[this.activeVarSet.DATA].maxVal;
    }
};

/**
* Return the number of rows in the dataset
*
* @returns {Integer} The maximum time value in Cesium JulianTime
*/
Dataset.prototype.getRowCount = function () {
    if (defined(this.activeVarSet.DATA)) {
        return this.variables[this.activeVarSet.DATA].vals.length;
    }
    return 0;
};

/**
* Get a list of variables
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

/**
* Get variable list by type
*
* @param {Integer|Array} a vartype id or array of vartypes
*
* @returns {Array} An array of variables
*/
Dataset.prototype.getVarListByType = function (varType) {
    var ret = [];
    for (var v in this.variables) {
        if (this.variables.hasOwnProperty(v)) {
            if (varType instanceof Array) {
                if (varType.indexOf(this.variables[v].varType) !== -1) {
                    ret.push(v);
                }
            }
            else if ((this.variables[v].varType === varType)) {
                ret.push(v);
            }
        }
    }
    return ret;
};

// Determine the min, max, and type of each variable
Dataset.prototype._processVariables = function () {
    this.activeVarSet = {};

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
            //handle enumerated variables
            if (variable.varType === VarType.SCALAR && variable.minVal > variable.maxVal) {
                variable.varType = VarType.ENUM;
                variable.processEnumVariable();            //calculate enum variables
            }
        }
    }

    //set default variables
    this.activeVarSet.LAT = this.getVarListByType(VarType.LAT)[0];
    this.activeVarSet.LON = this.getVarListByType(VarType.LON)[0];
    this.activeVarSet.ALT = this.getVarListByType(VarType.ALT)[0];
    this.activeVarSet.TIME = this.getVarListByType(VarType.TIME)[0];
    this.activeVarSet.DATA = this.getVarListByType([VarType.SCALAR,VarType.ENUM])[0];
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
* Set the current data variable
*
* @param {String} The initial variable to show
*
*/
Dataset.prototype.setDataVariable = function (varName) {
    if (!defined(this.variables[varName])) {
        return;
    }
    this.activeVarSet.DATA = varName;
};

/**
* Get the current variable name
*
* @returns {Object} the current variable name
*
*/
Dataset.prototype.getDataVariable = function () {
    return this.activeVarSet.DATA;
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
    if (!defined(this.variables[this.activeVarSet.DATA])) {
        return [];
    }

    var lon = defined(this.activeVarSet.LON) ? this.variables[this.activeVarSet.LON].vals : undefined;
    var lat = defined(this.activeVarSet.LAT) ? this.variables[this.activeVarSet.LAT].vals : undefined;
    var alt = defined(this.activeVarSet.ALT) ? this.variables[this.activeVarSet.ALT].vals : undefined;
    var time = this.activeVarSet.TIME ? this.variables[this.activeVarSet.TIME].timeVar.vals : undefined;
    var vals = this.variables[this.activeVarSet.DATA].vals;
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

