'use strict';

/*global require,URI*/

var defined = require('../../third_party/cesium/Source/Core/defined');
var defineProperties = require('../../third_party/cesium/Source/Core/defineProperties');
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
var MetadataItem = require('./MetadataItem');

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

    knockout.track(this, ['url', 'dataSetID', 'regionType', 'filter']);
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
//            var result = new Metadata();
//            result.isLoading = false;
//            result.dataSourceErrorMessage = 'This data source does not have any details available.';
//            result.serviceErrorMessage = 'This service does not have any details available.';
//            return result;

            if (!defined(this._metadata)) {
                this._metadata = requestMetadata(this);
            }
            return this._metadata;
        }
    }
});

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

AbsIttCatalogItem.prototype._load = function() {
    this._csvCatalogItem = new CsvCatalogItem(this.application);

    //get the GetDatasetConcepts and then the GetCodeListValue to build up heirarchical tree
    this.items = [];

    var baseUrl = cleanAndProxyUrl(this.application, this.url);
    var parameters = {
        method: 'GetDatasetConcepts',
        datasetid: this.dataSetID,
        format: 'json'
    };

    var that = this;
    that.data = {items: []};

    var url = baseUrl + '?' + objectToQuery(parameters);

    this.filter = [];

    return loadJson(url).then(function(json) {
        var concepts = json.concepts;

        var promises = [];

        var myFunc = function(url, concept) {
            return loadJson(url).then(function(json) {
                var node = {description: concept, code: ''};

                // Skip the last code, it's just the name of the dataset.
                var codes = json.codes;
                that.filter.push(concept + '.' + codes[0].code);

                function addTree(parent, code, codes) {
                    var node = {name: code.description, items: []};
                    parent.items.push(node);
                    for (var i = 0; i < codes.length - 1; ++i) {
                        if (codes[i].parentCode === code.code) {
                            addTree(node, codes[i], codes);
                        }
                    }
                }
                addTree(that.data, node, codes);
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

            promises.push(myFunc(url, concept));
        }
        return when.all(promises).then( function(results) {

            //TODO: build query filter list

            //TODO: if query not done yet,then call and set promise

            //TODO: when promises all done then sum up date for final csv

            //TODO: reload csv with new data

            var parameters = {
                method: 'GetGenericData',
                datasetid: that.dataSetID,
                and: createAnd(that),
                or: 'REGION',
                format: 'csv'
            };

            var url = baseUrl + '?' + objectToQuery(parameters);

            console.log(that.data);

            return loadText(url).then(function(text) {
                // Rename the 'REGION' column to the region type.
                text = text.replace(',REGION,', ',' + that.regionType + ',');
                that._csvCatalogItem.data = text;
                return that._csvCatalogItem.load();
            });
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


    //TODO: filter creates a set of urls all of which are summed for final csv
    //TODO: enforce policy in the ko ui tree
    //TODO: auto update from ko bindings in editing dialog

};

AbsIttCatalogItem.prototype._enable = function() {
    if (defined(this._csvCatalogItem)) {
        this.legendUrl = this._csvCatalogItem.legendUrl;
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
        this.legendUrl = this._csvCatalogItem.legendUrl;
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

function createAnd(catalogItem) {
    var and = catalogItem.filter.slice();
    and.unshift('REGIONTYPE.' + catalogItem.regionType);
    return and.join(',');
}

function requestMetadata(absItem) {
    var result = new Metadata();
    result.isLoading = true;
    function populateMetadata(metadataGroup, node) {
        for (var i = 0; i < node.items.length; i++) {
            var dest = new MetadataItem();
            dest.name = node.items[i].name;
            dest.value = 'temp';
            metadataGroup.items.push(dest);
            populateMetadata(dest, node.items[i]);
        }

    }
    populateMetadata(result.serviceMetadata, absItem.data);
    result.isLoading = false;
    return result;
}

module.exports = AbsIttCatalogItem;