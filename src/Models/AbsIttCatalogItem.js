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
     * Gets the list of additional concepts and values on which to filter the data.  You can obtain a list of all available
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

    knockout.track(this, ['url', 'dataSetID', 'regionType', 'filter', '_absDataset', 'opacity']);

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
    return [this.url, this.dataSetID, this.regionType, this.filter];
};

function skipConcept(concept) {
    var conceptMask = ["STATE","REGIONTYPE","REGION","FREQUENCY"];
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

    //call GetDatasetConcepts and then GetCodeListValue to build up a heirarchical tree

    var baseUrl = cleanAndProxyUrl(this.application, this.url);
    var parameters = {
        method: 'GetDatasetConcepts',
        datasetid: this.dataSetID,
        format: 'json'
    };

    this._absDataset = new AbsDataset();

    var that = this;
    var url = baseUrl + '?' + objectToQuery(parameters);

    return loadJson(url).then(function(json) {
        var concepts = json.concepts;

        var promises = [];

        var loadFunc = function(url, conceptName) {
            return loadJson(url).then(function(json) {
                var concept = new AbsConcept(conceptName);
                that.absDataset.items.push(concept);

                var codes = json.codes;

                function absCodeUpdate() { updateAbsResults(that); }
                var initActive = 1;
                function addTree(parent, codes) {
                    // Skip the last code, it's just the name of the dataset.
                    for (var i = 0; i < codes.length - 1; ++i) {
                        var parentCode = defined(parent.code) ? parent.code : '';
                        if (codes[i].parentCode === parentCode) {
                            var absCode = new AbsCode(codes[i].description, codes[i].code);
                            if (initActive-- > 0) {
                                absCode.isActive = true;
                            }
                            absCode.updateFunction = absCodeUpdate;
                            parent.items.push(absCode);
                            addTree(absCode, codes);
                        }
                    }
                }
                addTree(concept, codes);
            });
        };

        for (var i = 0; i < concepts.length - 1; ++i) {
            var concept = concepts[i];

            if (skipConcept(concept)) {
                continue;
            }

            var parameters = {
                method: 'GetCodeListValue',
                datasetid: that.dataSetID,
                concept: concept,
                format: 'json'
            };

            var url = baseUrl + '?' + objectToQuery(parameters);

            promises.push(loadFunc(url, concept));
        }
        return when.all(promises).then( function(results) {

            that._absDataset.isLoading = false;

            return updateAbsResults(that);

        });
    }).otherwise(function(e) {
        throw new ModelError({
            sender: that,
            title: 'Group is not available',
            message: '\
An error occurred while invoking GetCodeListValue on the ABS ITT server.  \
<p>If you entered the link manually, please verify that the link is correct.</p>\
<p>This error may also indicate that the server does not support <a href="http://enable-cors.org/" target="_blank">CORS</a>.  If this is your \
server, verify that CORS is enabled and enable it if it is not.  If you do not control the server, \
please contact the administrator of the server and ask them to enable CORS.  Or, contact the National \
Map team by emailing <a href="mailto:nationalmap@lists.nicta.com.au">nationalmap@lists.nicta.com.au</a> \
and ask us to add this server to the list of non-CORS-supporting servers that may be proxied by \
National Map itself.</p>\
<p>If you did not enter this link manually, this error may indicate that the group you opened is temporarily unavailable or there is a \
problem with your internet connection.  Try opening the group again, and if the problem persists, please report it by \
sending an email to <a href="mailto:nationalmap@lists.nicta.com.au">nationalmap@lists.nicta.com.au</a>.</p>'
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

function createAnd(filter, regionType) {
    var and = filter.slice();
    and.unshift('REGIONTYPE.' + regionType);
    return and.join(',');
}

function updateAbsResults(absItem) {

    //walk tree to get active codes
    var activeCodes = [];
    function appendActiveCodes(parent, idxConcept, conceptName) {
        for (var i = 0; i < parent.items.length; i++) {
            var node = parent.items[i];
            //don't do children if parent active since it's a total
            if (node.isActive) {
                activeCodes[idxConcept].push({filter: conceptName + '.' + node.code, name: node.name});
            }
            else {
                appendActiveCodes(node, idxConcept, conceptName);
            }
        }
    }

    //check that we can create valid filters
    var bValidSelection = true;
    for (var f = 0; f < absItem._absDataset.items.length; f++) {
        var concept = absItem._absDataset.items[f];
        activeCodes[f] = [];
        appendActiveCodes(concept, f, concept.name);
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
    var queryNames = [];
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
            absItem.queryList.push(result);
        });
    };

    var promises = [];
    var baseUrl = cleanAndProxyUrl(absItem.application, absItem.url);
    var regionType = absItem.regionType;
    for (var i = 0; i < queryFilters.length; ++i) {
        var filter = queryFilters[i];
        var parameters = {
            method: 'GetGenericData',
            datasetid: absItem.dataSetID,
            and: createAnd(filter, regionType),
            or: 'REGION',
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
            for (var n = 1; n < csvArray.length; n++) {
                finalCsvArray[n].push(csvArray[n][valOrig]);
                if (i > 0) {
                    finalCsvArray[n][valDest] += csvArray[n][valOrig];
                }
            }
            //TODO: if percentage change value to value/total?
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