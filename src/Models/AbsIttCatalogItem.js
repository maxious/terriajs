'use strict';

/*global require,URI,$*/

var clone = require('../../third_party/cesium/Source/Core/clone');
var defined = require('../../third_party/cesium/Source/Core/defined');
var defineProperties = require('../../third_party/cesium/Source/Core/defineProperties');
var freezeObject = require('../../third_party/cesium/Source/Core/freezeObject');
var knockout = require('../../third_party/cesium/Source/ThirdParty/knockout');
var objectToQuery = require('../../third_party/cesium/Source/Core/objectToQuery');
var loadJson = require('../../third_party/cesium/Source/Core/loadJson');
var ModelError = require('./ModelError');
var when = require('../../third_party/cesium/Source/ThirdParty/when');

var CatalogItem = require('./CatalogItem');
var CsvCatalogItem = require('./CsvCatalogItem');
var inherit = require('../Core/inherit');
var loadText = require('../../third_party/cesium/Source/Core/loadText');
var Metadata = require('./Metadata');

var AbsDataset = require('./AbsDataset');
var AbsConcept = require('./AbsConcept');
var AbsCode = require('./AbsCode');


/**
 * A {@link CatalogItem} representing region-mapped data obtained from the Australia Bureau of Statistics
 * (ABS) ITT query interface.  Documentation for the query interface is found here: http://stat.abs.gov.au/itt/r.jsp?api
 *
 * @alias AbsIttCatalogItem
 * @constructor
 * @extends CatalogItem
 * 
 * @param {Application} application The application.
 */
var AbsIttCatalogItem = function(application) {
    CatalogItem.call(this, application);

    this._csvCatalogItem = undefined;
    this._metadata = undefined;
    this._absDataset = undefined;
    this._concepts = [];

    /**
     * Gets or sets the URL of the ABS ITT API, typically http://stat.abs.gov.au/itt/query.jsp.
     * This property is observable.
     * @type {String}
     */
    this.url = undefined;

    /**
     * Gets or sets the ID of the ABS dataset.  You can obtain a list of all datasets by querying
     * http://stat.abs.gov.au/itt/query.jsp?method=GetDatasetList (or equivalent).  This property
     * is observable.
     * @type {String}
     */
    this.dataSetID = undefined;

    /**
     * Gets or sets the ABS region type to query.  You can obtain a list of all available region types for
     * a dataset by querying
     * http://stat.abs.gov.au/itt/query.jsp?method=GetCodeListValue&datasetid=ABS_CENSUS2011_B25&concept=REGIONTYPE&format=json
     * (or equivalent).  This property is observable.
     * @type {String}
     */
    this.regionType = undefined;

    /**
     * Gets or sets the ABS region concept.  You can obtain a list of all available concepts for
     * a dataset by querying
     * http://stat.abs.gov.au/itt/query.jsp?method=GetDatasetConcepts&datasetid=ABS_CENSUS2011_B19
     * (or equivalent).  This property is observable.
     * @type {String}
     */
    this.regionConcept = 'REGION';

    /**
     * Gets the list of initial concepts and codes on which to filter the data.  You can obtain a list of all available
     * concepts for a dataset by querying http://stat.abs.gov.au/itt/query.jsp?method=GetDatasetConcepts&datasetid=ABS_CENSUS2011_B25
     * (or equivalent) and a list of the possible values for a concept by querying
     * http://stat.abs.gov.au/itt/query.jsp?method=GetCodeListValue&datasetid=ABS_CENSUS2011_B25&concept=MEASURE&format=json.
     * @type {Array}
     */
    this.filter = [];

    /**
     * Gets or sets the opacity (alpha) of the data item, where 0.0 is fully transparent and 1.0 is
     * fully opaque.  This property is observable.
     * @type {Number}
     * @default 0.6
     */
    this.opacity = 0.6;

    knockout.track(this, ['url', 'dataSetID', 'regionType', 'regionConcept', 'filter', '_absDataset', 'opacity']);

    delete this.__knockoutObservables.absDataset;
    knockout.defineProperty(this, 'absDataset', {
        get : function() {
            return this._absDataset;
        },
        set : function(value) {
            this._absDataset = value;
        }
    });

    knockout.getObservable(this, 'opacity').subscribe(function(newValue) {
        this._csvCatalogItem.opacity = this.opacity;
    }, this);
};

inherit(CatalogItem, AbsIttCatalogItem);

defineProperties(AbsIttCatalogItem.prototype, {
    /**
     * Gets the type of data member represented by this instance.
     * @memberOf AbsIttCatalogItem.prototype
     * @type {String}
     */
    type : {
        get : function() {
            return 'abs-itt';
        }
    },

    /**
     * Gets a human-readable name for this type of data source, 'GPX'.
     * @memberOf AbsIttCatalogItem.prototype
     * @type {String}
     */
    typeName : {
        get : function() {
            return 'ABS.Stat';
        }
    },

    /**
     * Gets the metadata associated with this data source and the server that provided it, if applicable.
     * @memberOf GpxCatalogItem.prototype
     * @type {Metadata}
     */
    metadata : {
        get : function() {
            var result = new Metadata();
            result.isLoading = false;
            result.dataSourceErrorMessage = 'This data source does not have any details available.';
            result.serviceErrorMessage = 'This service does not have any details available.';
            return result;
        }
    },


    /**
     * Gets a value indicating whether this data source, when enabled, can be reordered with respect to other data sources.
     * Data sources that cannot be reordered are typically displayed above reorderable data sources.
     * @memberOf CsvCatalogItem.prototype
     * @type {Boolean}
     */
    supportsReordering : {
        get : function() {
            return true;
        }
    },
    /**
     * Gets a value indicating whether the opacity of this data source can be changed.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {Boolean}
     */
    supportsOpacity : {
        get : function() {
            return true;
        }
    },

    /**
     * Gets the Cesium or Leaflet imagery layer object associated with this data source.
     * This property is undefined if the data source is not enabled.
     * @memberOf CsvCatalogItem.prototype
     * @type {Object}
     */
    imageryLayer : {
        get : function() {
            if (defined(this._csvCatalogItem)) {
                return this._csvCatalogItem.imageryLayer;
            }
            return undefined;
        }
    },

    /**
     * Gets the set of names of the properties to be serialized for this object when {@link CatalogMember#serializeToJson} is called
     * and the `serializeForSharing` flag is set in the options.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {String[]}
     */
    propertiesForSharing : {
        get : function() {
            return AbsIttCatalogItem.defaultPropertiesForSharing;
        }
    }
});

/**
 * Gets or sets the default set of properties that are serialized when serializing a {@link CatalogItem}-derived object with the
 * `serializeForSharing` flag set in the options.
 * @type {String[]}
 */
AbsIttCatalogItem.defaultPropertiesForSharing = clone(CatalogItem.defaultPropertiesForSharing);
AbsIttCatalogItem.defaultPropertiesForSharing.push('opacity');
freezeObject(AbsIttCatalogItem.defaultPropertiesForSharing);


AbsIttCatalogItem.prototype._getValuesThatInfluenceLoad = function() {
    return [this.url, this.dataSetID, this.regionType, this.regionConcept, this.filter];
};

//TODO: look at exposing these
function skipConcept(concept, regionConcept) {
    var conceptMask = ["STATE","REGIONTYPE","FREQUENCY",regionConcept];
    for (var i = 0; i < conceptMask.length; i++) {
        if (conceptMask[i] === concept) {
            return true;
        }
    }
    return false;
}


//TODO: use region or regiontype concept to decide on region

AbsIttCatalogItem.prototype._load = function() {
    this._csvCatalogItem = new CsvCatalogItem(this.application);
    this._csvCatalogItem.opacity = this.opacity;

    var baseUrl = cleanAndProxyUrl(this.application, this.url);
    var parameters = {
        method: 'GetDatasetConcepts',
        datasetid: this.dataSetID,
        format: 'json'
    };
    var url = baseUrl + '?' + objectToQuery(parameters);

    url = './data/2011Census_B15_AUST_POA_short.json';

    var that = this;
    var conceptNameMap, loadPromises = [];

    this._absDataset = new AbsDataset();

    //cover for missing human readable name in api
    loadPromises[0] = loadJson('data/abs_names.json').then(function(json) {
        conceptNameMap = json;
    });
    function getConceptName(id) {
        return defined(conceptNameMap[id]) ? conceptNameMap[id] : id;
    }

    loadPromises[1] = loadJson(url).then(function(json) {
        that._concepts = json.concepts;
        console.log('concepts', that._concepts);
    });

    return when.all(loadPromises).then(function() {
        //call GetDatasetConcepts and then GetCodeListValue to build up a heirarchical tree

        var promises = [];

        var loadFunc = function(url, concept) {
            return loadJson(url).then(function(json) {
                console.log(url);
                that.absDataset.items.push(concept);

                var codes = json.codes;

                function absCodeUpdate() { updateAbsResults(that, false); }
                var initActive = 1;
                function addTree(parent, codes) {
                    for (var i = 0; i < codes.length; ++i) {
                        var parentCode = (parent instanceof AbsCode) ? parent.code : '';
                        if (codes[i].parentCode === parentCode) {
                            var absCode = new AbsCode(codes[i].code, codes[i].description);
                            if (initActive-- > 0) {
                                absCode.isActive = true;
                            }
                            if (parentCode === '' && codes.length < 50) {
                                absCode.isOpen = true;
                            }
                            absCode.parent = parent;
                            absCode.updateFunction = absCodeUpdate;
                            parent.items.push(absCode);
                            addTree(absCode, codes);
                        }
                    }
                }
                addTree(concept, codes);
            });
        };

        for (var i = 0; i < that._concepts.length; ++i) {
            var conceptID = that._concepts[i];

            if (skipConcept(conceptID, that.regionConcept)) {
                continue;
            }

            var parameters = {
                method: 'GetCodeListValue',
                datasetid: that.dataSetID,
                concept: conceptID,
                format: 'json'
            };

            var url = baseUrl + '?' + objectToQuery(parameters);

            var concept = new AbsConcept(conceptID, getConceptName(conceptID));
            promises.push(loadFunc(url, concept));
        }
        return when.all(promises).then( function(results) {

            that._absDataset.isLoading = false;

            //TODO: see if I can get rid of this - also if need to flag show on initial load
            return updateAbsResults(that);

        });
    }).otherwise(function(e) {
        throw new ModelError({
            sender: that,
            title: 'Group is not available',
            message: '\
An error occurred while invoking GetCodeListValue on the ABS ITT server.'
        });
    });
};

AbsIttCatalogItem.prototype._enable = function() {
    if (defined(this._csvCatalogItem)) {
        this._csvCatalogItem._enable();
    }
};

AbsIttCatalogItem.prototype._disable = function() {
    if (defined(this._csvCatalogItem)) {
        this._csvCatalogItem._disable();
    }
};

AbsIttCatalogItem.prototype._show = function() {
    if (defined(this._csvCatalogItem)) {
        this._csvCatalogItem._show();
        updateAbsResults(this, true);
        this.initialShow = false;
    }
};

AbsIttCatalogItem.prototype._hide = function() {
    if (defined(this._csvCatalogItem)) {
        this._csvCatalogItem._hide();
    }
};

function cleanAndProxyUrl(application, url) {
    return proxyUrl(application, cleanUrl(url));
}

function cleanUrl(url) {
    // Strip off the search portion of the URL
    var uri = new URI(url);
    uri.search('');
    return uri.toString();
}

function proxyUrl(application, url) {
    if (defined(application.corsProxy) && application.corsProxy.shouldUseProxy(url)) {
        return application.corsProxy.getURL(url);
    }

    return url;
}

function updateAbsResults(absItem, forceUpdate) {

    if (!forceUpdate && !absItem.isShown) {
        return;
    }

    //walk tree to get active codes
    var activeCodes = [];
    function appendActiveCodes(parent, idxConcept, conceptCode) {
        for (var i = 0; i < parent.items.length; i++) {
            var node = parent.items[i];
            //don't do children if parent active since it's a total
            if (node.isActive) {
                activeCodes[idxConcept].push({filter: conceptCode + '.' + node.code, name: node.name});
            }
            else {
                appendActiveCodes(node, idxConcept, conceptCode);
            }
        }
    }

    //check that we can create valid filters
    var bValidSelection = true;
    for (var f = 0; f < absItem._absDataset.items.length; f++) {
        var concept = absItem._absDataset.items[f];
        activeCodes[f] = [];
        appendActiveCodes(concept, f, concept.code);
        if (activeCodes[f].length === 0) {
            bValidSelection = false;
            break;
        }
    }
    if (!bValidSelection) {
        console.log('No display because each concept must have at least one code selected.');
        return when(absItem._csvCatalogItem.dynamicUpdate('')).then(function() {
            absItem.legendUrl = '';
            absItem.application.currentViewer.notifyRepaintRequired();
       });
    }

    //build filters from activeCodes
    var queryFilters = [];
    var queryNames = [];  //TODO: make an object?
    function buildQueryFilters(idxConcept, filterIn, nameIn) {
        for (var i = 0; i < activeCodes[idxConcept].length; i++) {
            var filter = filterIn.slice();
            filter.push(activeCodes[idxConcept][i].filter);
            var name = nameIn.slice();
            name.push(activeCodes[idxConcept][i].name);
            if (idxConcept+1 === activeCodes.length) {
                queryFilters.push(filter);
                queryNames.push(name);
            } else {
                buildQueryFilters(idxConcept+1, filter, name);
            }
        }
    }
    buildQueryFilters(0, [], []);


    //build abs itt api urls and load the text for each
    if (!defined(absItem.queryList)) {
        absItem.queryList = [];
    }

    function getQueryDataIndex(url) {
        for (var i = 0; i < absItem.queryList.length; i++) {
            if (absItem.queryList[i].url === url) {
                return i;
            }
        }
        return -1;
    }

    var currentQueryList = [];
    var loadFunc = function(url, name) {
        if (getQueryDataIndex(url) !== -1) {
            return;
        }
        return loadText(url).then(function(text) {
            var result = {url: url, name: name};
            result.data = $.csv.toArrays(text, {
                onParseValue: $.csv.hooks.castToScalar
            });
            //clean up spurious extra lines from api
            if (result.data.length > 0 && result.data[result.data.length-1].length < result.data[0].length) {
                result.data.length--;
            }
            absItem.queryList.push(result);
        });
    };

    var promises = [];
    var baseUrl = cleanAndProxyUrl(absItem.application, absItem.url);
    var regionType = absItem.regionType;
    for (var i = 0; i < queryFilters.length; ++i) {
        var filter = queryFilters[i];
            //HACK FOR NOW - need to define regionTypeConcept?
        if (absItem._concepts.indexOf('REGIONTYPE') !== -1) {
            filter.push('REGIONTYPE.' + regionType);
        }
        var parameters = {
            method: 'GetGenericData',
            datasetid: absItem.dataSetID,
            and: filter.join(','),
            or: absItem.regionConcept,
            format: 'csv'
        };
        var url = baseUrl + '?' + objectToQuery(parameters);

        var name = queryNames[i].join(' ');

        currentQueryList.push(url);  //remember for this specific dataset

        promises.push(loadFunc(url, name));
    }

    return when.all(promises).then( function(results) {
        //When promises all done then sum up date for final csv
        var finalCsvArray;
        var colAdd = [false,true,true,true];
        function filterRow(arr) {
            var newRow = [];
            arr.map(function (val, c) {
                if (colAdd[c]) {
                    newRow.push(val);
                }
            });
            return newRow;
        }                
        for (var i = 0; i < currentQueryList.length; i++) {
            var ndx = getQueryDataIndex(currentQueryList[i]);
            var csvArray = absItem.queryList[ndx].data;
            if (csvArray.length === 0) {
                continue;
            }
            var valDest;
            if (!defined(finalCsvArray)) {
                finalCsvArray = csvArray.map(filterRow);
                valDest = finalCsvArray[0].indexOf('Value');
                finalCsvArray[0][valDest] = 'Total';
                var idxRgn = finalCsvArray[0].indexOf('REGION');
                finalCsvArray[0][idxRgn] = absItem.regionType;
            }
            var valOrig = csvArray[0].indexOf('Value');
            finalCsvArray[0].push(absItem.queryList[ndx].name);
            for (var n = 1; n < finalCsvArray.length; n++) {
                finalCsvArray[n].push(csvArray[n][valOrig]);
                if (i > 0) {
                    finalCsvArray[n][valDest] += csvArray[n][valOrig];
                }
            }
            //TODO: if percentage change value to value/total?
        }
        //check that the created csvArray is ok
        if (!defined(finalCsvArray) || finalCsvArray.length === 0) {
            return when(absItem._csvCatalogItem.dynamicUpdate('')).then(function() {
                absItem.legendUrl = '';
                absItem.application.currentViewer.notifyRepaintRequired();
            });
        }

        //Serialize the arrays
        var joinedRows = finalCsvArray.map(function(arr) {
            return arr.join(',');
        });
        var text = joinedRows.join('\n');

        return when(absItem._csvCatalogItem.dynamicUpdate(text)).then(function() {
            absItem.legendUrl = absItem._csvCatalogItem.legendUrl;
            absItem.application.currentViewer.notifyRepaintRequired();
        });
    });
}


module.exports = AbsIttCatalogItem;