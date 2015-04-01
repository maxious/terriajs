'use strict';

/*global require,L,$*/

var Cartesian2 = require('../../third_party/cesium/Source/Core/Cartesian2');
var CesiumMath = require('../../third_party/cesium/Source/Core/Math');
var clone = require('../../third_party/cesium/Source/Core/clone');
var combine = require('../../third_party/cesium/Source/Core/combine');
var defaultValue = require('../../third_party/cesium/Source/Core/defaultValue');
var defined = require('../../third_party/cesium/Source/Core/defined');
var defineProperties = require('../../third_party/cesium/Source/Core/defineProperties');
var DeveloperError = require('../../third_party/cesium/Source/Core/DeveloperError');
var ImageryLayer = require('../../third_party/cesium/Source/Scene/ImageryLayer');
var freezeObject = require('../../third_party/cesium/Source/Core/freezeObject');
var knockout = require('../../third_party/cesium/Source/ThirdParty/knockout');
var loadText = require('../../third_party/cesium/Source/Core/loadText');
var Rectangle = require('../../third_party/cesium/Source/Core/Rectangle');
var WebMapServiceImageryProvider = require('../../third_party/cesium/Source/Scene/WebMapServiceImageryProvider');
var WebMapServiceCatalogItem = require('./WebMapServiceCatalogItem');
var WebMercatorProjection = require('../../third_party/cesium/Source/Core/WebMercatorProjection');
var WebMercatorTilingScheme = require('../../third_party/cesium/Source/Core/WebMercatorTilingScheme');
var when = require('../../third_party/cesium/Source/ThirdParty/when');

var CatalogItem = require('./CatalogItem');
var corsProxy = require('../Core/corsProxy');
var inherit = require('../Core/inherit');
var Metadata = require('./Metadata');
var ModelError = require('./ModelError');
var readText = require('../Core/readText');
var TableDataSource = require('../Map/TableDataSource');
var VarType = require('../Map/VarType');

/**
 * A {@link CatalogItem} representing CSV data.
 *
 * @alias CsvCatalogItem
 * @constructor
 * @extends CatalogItem
 * 
 * @param {Application} application The application.
 * @param {String} [url] The URL from which to retrieve the CSV data.
 */
var CsvCatalogItem = function(application, url) {
    CatalogItem.call(this, application);

    this._tableDataSource = undefined;
    this._regionMapped = false;
    this._minDisplayValue = undefined;
    this._maxDisplayValue = undefined;

    /**
     * Gets or sets the URL from which to retrieve CSV data.  This property is ignored if
     * {@link GeoJsonCatalogItem#data} is defined.  This property is observable.
     * @type {String}
     */
    this.url = url;

    /**
     * Gets or sets the CSV data, represented as a binary Blob, a string, or a Promise for one of those things.
     * This property is observable.
     * @type {Blob|String|Promise}
     */
    this.data = undefined;

    /**
     * Gets or sets the URL from which the {@link CsvCatalogItem#data} was obtained.
     * @type {String}
     */
    this.dataSourceUrl = undefined;

    /**
     * Gets or sets a value indicating whether data points in the CSV are color-coded based on the
     * value column.
     * @type {Boolean}
     * @default true
     */
    this.colorByValue = true;

    /**
     * Gets or sets the opacity (alpha) of the data item, where 0.0 is fully transparent and 1.0 is
     * fully opaque.  This property is observable.
     * @type {Number}
     * @default 0.6
     */
    this.opacity = 0.6;

    knockout.track(this, ['url', 'data', 'dataSourceUrl', 'colorByValue', 'opacity']);

    knockout.getObservable(this, 'opacity').subscribe(function(newValue) {
        updateOpacity(this);
    }, this);

};

inherit(CatalogItem, CsvCatalogItem);

defineProperties(CsvCatalogItem.prototype, {
    /**
     * Gets the type of data member represented by this instance.
     * @memberOf CsvCatalogItem.prototype
     * @type {String}
     */
    type : {
        get : function() {
            return 'csv';
        }
    },

    /**
     * Gets a human-readable name for this type of data source, 'CSV'.
     * @memberOf CsvCatalogItem.prototype
     * @type {String}
     */
    typeName : {
        get : function() {
            return 'Comma-Separated Values (CSV)';
        }
    },

    /**
     * Gets the metadata associated with this data source and the server that provided it, if applicable.
     * @memberOf CsvCatalogItem.prototype
     * @type {Metadata}
     */
    metadata : {  //TODO: return metadata if tableDataSource defined
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
            return this._regionMapped;
        }
    },

    /**
     * Gets a value indicating whether the opacity of this data source can be changed.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {Boolean}
     */
    supportsOpacity : {
        get : function() {
            return this._regionMapped;
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
            return this._imageryLayer;
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
            return CsvCatalogItem.defaultPropertiesForSharing;
        }
    }
});

/**
 * Gets or sets the default set of properties that are serialized when serializing a {@link CatalogItem}-derived object with the
 * `serializeForSharing` flag set in the options.
 * @type {String[]}
 */
CsvCatalogItem.defaultPropertiesForSharing = clone(CatalogItem.defaultPropertiesForSharing);
CsvCatalogItem.defaultPropertiesForSharing.push('opacity');
freezeObject(CsvCatalogItem.defaultPropertiesForSharing);


CsvCatalogItem.prototype._getValuesThatInfluenceLoad = function() {
    return [this.url, this.data, this.colorByValue];
};

CsvCatalogItem.prototype._load = function() {
    if (defined(this._tableDataSource)) {
        this._tableDataSource.destroy();
    }

    this._tableDataSource = new TableDataSource();
    this._tableDataSource.colorByValue = this.colorByValue;

    var that = this;

    if (defined(this.data)) {
        return when(that.data, function(data) {
            if (typeof Blob !== 'undefined' && data instanceof Blob) {
                return readText(data).then(function(text) {
                    return loadTable(that, text);
                });
            } else if (typeof data === 'string') {
                return loadTable(that, data);
            } else {
                throw new ModelError({
                    sender: that,
                    title: 'Unexpected type of CSV data',
                    message: '\
CsvCatalogItem.data is expected to be a Blob, File, or String, but it was not any of these. \
This may indicate a bug in National Map or incorrect use of the National Map API. \
If you believe it is a bug in National Map, please report it by emailing \
<a href="mailto:nationalmap@lists.nicta.com.au">nationalmap@lists.nicta.com.au</a>.'
                });
            }
        });
    } else if (defined(that.url)) {
        return loadText(proxyUrl(that.application, that.url)).then(function(text) {
            return loadTable(that, text);
        }).otherwise(function(e) {
            throw new ModelError({
                sender: that,
                title: 'Could not load CSV file',
                message: '\
An error occurred while retrieving CSV data from the provided link.'
            });
        });
    }
};

CsvCatalogItem.prototype._enableInCesium = function() {
};

CsvCatalogItem.prototype._disableInCesium = function() {
};

CsvCatalogItem.prototype._showInCesium = function() {

    if (!this._regionMapped) {
        var dataSources = this.application.dataSources;
        if (dataSources.contains(this._tableDataSource)) {
            throw new DeveloperError('This data source is already shown.');
        }

        dataSources.add(this._tableDataSource);
    }
    else {
        var scene = this.application.cesium.scene;

        var imageryProvider = new WebMapServiceImageryProvider({
            url : proxyUrl(this.application, this.regionServer),
            layers : this.regionLayers,
            parameters : WebMapServiceCatalogItem.defaultParameters
        });

        imageryProvider.base_requestImage = imageryProvider.requestImage;
        var that = this;
        imageryProvider.requestImage = function(x, y, level) {
            var imagePromise = imageryProvider.base_requestImage(x, y, level);
            if (!defined(imagePromise)) {
                return imagePromise;
            }
            
            return when(imagePromise, function(image) {
                if (defined(image)) {
                    image = recolorImageWithCanvas(that, image, that.colorFunc);
                }
                return image;
            });
        };
            //remap image layer featurePicking Func
        imageryProvider.base_pickFeatures = imageryProvider.pickFeatures;
        imageryProvider.pickFeatures = function(x, y, level, longitude, latitude) {
            var featurePromise = imageryProvider.base_pickFeatures(x, y, level, longitude, latitude);
            if (!defined(featurePromise)) {
                return featurePromise;
            }
            
            return when(featurePromise, function(results) {
                if (defined(results)) {
                    var id = results[0].data.properties[that.regionProp];
                    var properties = that.rowProperties(parseInt(id,10));
                    results[0].description = that._tableDataSource.describe(properties);
                }
                return results;
            });
        };

        this._imageryLayer = new ImageryLayer(imageryProvider, {alpha : this.opacity} );

        scene.imageryLayers.add(this._imageryLayer);

    }
};

CsvCatalogItem.prototype._hideInCesium = function() {

    if (!this._regionMapped) {
        var dataSources = this.application.dataSources;
        if (!dataSources.contains(this._tableDataSource)) {
            throw new DeveloperError('This data source is not shown.');
        }
        
        dataSources.remove(this._tableDataSource, false);
    }
    else {
        if (!defined(this._imageryLayer)) {
            throw new DeveloperError('This data source is not enabled.');
        }
        
        var scene = this.application.cesium.scene;
        scene.imageryLayers.remove(this._imageryLayer);
        this._imageryLayer = undefined;
    }
};

CsvCatalogItem.prototype._enableInLeaflet = function() {
};

CsvCatalogItem.prototype._disableInLeaflet = function() {
};

CsvCatalogItem.prototype._showInLeaflet = function() {

    if (!this._regionMapped) {
        this._showInCesium();
    }
    else {
        if (defined(this._imageryLayer)) {
            throw new DeveloperError('This data source is already enabled.');
        }
        
        var map = this.application.leaflet.map;
        
        var options = {
            layers : this.regionLayers,
            opacity : this.opacity
        };
        options = combine(defaultValue(WebMapServiceCatalogItem.defaultParameters), options);

        this._imageryLayer = new L.tileLayer.wms(proxyUrl(this.application, this.regionServer), options);

        var that = this;
        this._imageryLayer.setFilter(function () {
            new L.CanvasFilter(this, {
                channelFilter: function (image) {
                    return recolorImage(image, that.colorFunc);
                }
           }).render();
        });
        this.wmsFeatureInfoFilter = function(result) {
                if (defined(result)) {
                    var properties = result.features[0].properties;
                    var id = properties[that.regionProp];
                    properties = combine(properties, that.rowProperties(parseInt(id,10)));
                    properties.FID = undefined;
                    properties[that.regionProp] = undefined;
                    result.features[0].properties = properties;
                }
                return result;
            };

        map.addLayer(this._imageryLayer);
    }
};

CsvCatalogItem.prototype._hideInLeaflet = function() {
    if (!this._regionMapped) {
        this._hideInCesium();
    }
    else {
        if (!defined(this._imageryLayer)) {
            throw new DeveloperError('This data source is not enabled.');
        }

        var map = this.application.leaflet.map;
        map.removeLayer(this._imageryLayer);
        this._imageryLayer = undefined;
    }
};

CsvCatalogItem.prototype._rebuild = function() {
    if (defined(this.application.cesium)) {
        this._hideInCesium();
        this._showInCesium();
    } else {
        this._hideInLeaflet();
        this._showInLeaflet();
    }
};

CsvCatalogItem.prototype.dynamicUpdate = function(text) {
    this.data = text;  //TODO: is this causing 2 draws??
    var that = this;

    if (defined(this._tableDataSource)) {
        if (defined(this.application.cesium)) {
            if (defined(this._imageryLayer)) {
                this._hideInCesium();
            }
            return when(this.load()).then(function () {
                that._showInCesium();
            });
        }
        else {
            if (defined(this._imageryLayer)) {
                this._hideInLeaflet();
            }
            return when(this.load()).then(function () {
                that._showInLeaflet();
            });
        }
    }
    else {
        return this.load();
    }
};

CsvCatalogItem.prototype.pickFeaturesInLeaflet = function(mapExtent, mapWidth, mapHeight, pickX, pickY) {
    if (!this._regionMapped) {
        return undefined;
    }

    var projection = new WebMercatorProjection();
    var sw = projection.project(Rectangle.southwest(mapExtent));
    var ne = projection.project(Rectangle.northeast(mapExtent));

    var tilingScheme = new WebMercatorTilingScheme({
        rectangleSouthwestInMeters: sw,
        rectangleNortheastInMeters: ne
    });

    // Compute the longitude and latitude of the pick location.
    var x = CesiumMath.lerp(sw.x, ne.x, pickX / (mapWidth - 1));
    var y = CesiumMath.lerp(ne.y, sw.y, pickY / (mapHeight - 1));

    var ll = projection.unproject(new Cartesian2(x, y));

    // Use a Cesium imagery provider to pick features.
    var imageryProvider = new WebMapServiceImageryProvider({
        url : proxyUrl(this.application, this.regionServer),
        layers : this.regionLayers,
        tilingScheme : tilingScheme,
        tileWidth : mapWidth,
        tileHeight : mapHeight
    });

    var pickFeaturesPromise = imageryProvider.pickFeatures(0, 0, 0, ll.longitude, ll.latitude);
    if (!defined(pickFeaturesPromise)) {
        return pickFeaturesPromise;
    }

    var that = this;
    return pickFeaturesPromise.then(function(results) {
        if (defined(results)) {
            var id = results[0].data.properties[that.regionProp];
            var properties = that.rowProperties(parseInt(id,10));
            results[0].description = that._tableDataSource.describe(properties);
        }
        return results;
    });
};

function proxyUrl(application, url) {
    if (defined(application.corsProxy) && application.corsProxy.shouldUseProxy(url)) {
        return application.corsProxy.getURL(url);
    }

    return url;
}



function updateOpacity(csvItem) {
    if (defined(csvItem._imageryLayer)) {
        if (defined(csvItem._imageryLayer.alpha)) {
            csvItem._imageryLayer.alpha = csvItem.opacity;
        }

        if (defined(csvItem._imageryLayer.setOpacity)) {
            csvItem._imageryLayer.setOpacity(csvItem.opacity);
        }

        csvItem.application.currentViewer.notifyRepaintRequired();
    }
}

//////////////////////////////////////////////////////////////////////////

function loadTable(csvItem, text) {
    if (text.length === 0) {
        return;
    }    
    csvItem._tableDataSource.loadText(text);

    csvItem._tableDataSource.maxDisplayValue = csvItem._maxDisplayValue;
    csvItem._tableDataSource.minDisplayValue = csvItem._minDisplayValue;

    if (!csvItem._tableDataSource.dataset.hasLocationData()) {
        console.log('No locaton date found in csv file - trying to match based on region');
//        csvItem.data = text;
        return when(addRegionMap(csvItem), function() {
            if (csvItem._regionMapped !== true) {
                throw new ModelError({
                    sender: csvItem,
                    title: 'Could not load CSV file',
                    message: '\
Could not find any location parameters for latitude and longitude and was not able to determine \
a region mapping column.'
                });
            }
            else {
                csvItem.legendUrl = csvItem._tableDataSource.getLegendGraphic();
                csvItem.application.currentViewer.notifyRepaintRequired();
            }
        });
    }
    else {
        csvItem.clock = csvItem._tableDataSource.clock;
        csvItem.rectangle = csvItem._tableDataSource.dataset.getExtent();
        csvItem.legendUrl = csvItem._tableDataSource.getLegendGraphic();
        csvItem.application.currentViewer.notifyRepaintRequired();
    }
}


//////////////////////////////////////////////////////////////////////////

//Recolor an image using a color function
function recolorImage(image, colorFunc) {
    var length = image.data.length;  //pixel count * 4
    for (var i = 0; i < length; i += 4) {
        if (image.data[i+3] < 255) {
            continue;
        }
        if (image.data[i] === 0) {
            var idx = image.data[i+1] * 0x100 + image.data[i+2];
            var clr = colorFunc(idx);
            if (defined(clr)) {
                for (var j = 0; j < 4; j++) {
                    image.data[i+j] = clr[j];
                }
            }
            else {
                image.data[i+3] = 0;
            }
        }
    }
    return image;
}

//Recolor an image using 2d canvas
function recolorImageWithCanvas(csvCatalogItem, img, colorFunc) {
    var context = csvCatalogItem._canvas2dContext;

    if (!defined(context) || context.canvas.width !== img.width || context.canvas.height !== img.height) {
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        context = csvCatalogItem._canvas2dContext = canvas.getContext("2d");
    }

    // Copy the image contents to the canvas
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.drawImage(img, 0, 0);
    var image = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
    
    return recolorImage(image, colorFunc);
}


var regionServer = 'http://geoserver.nationalmap.nicta.com.au/region_map/ows';
var regionWmsMap = {
    'STE': {
        "name":"region_map:FID_STE_2011_AUST",
        "regionProp": "STE_CODE11",
        "aliases": ['state', 'ste'],
        "digits": 1
    },
    'SA4': {
        "name":"region_map:FID_SA4_2011_AUST",
        "regionProp": "SA4_CODE11",
        "aliases": ['sa4'],
        "digits": 3
    },
    'SA3': {
        "name":"region_map:FID_SA3_2011_AUST",
        "regionProp": "SA3_CODE11",
        "aliases": ['sa3'],
        "digits": 5
    },
    'SA2': {
        "name":"region_map:FID_SA2_2011_AUST",
        "regionProp": "SA2_MAIN11",
        "aliases": ['sa2'],
        "digits": 9
    },
// COMMENTING OUT SA1: it works, but server performance is just too slow to be widely usable
//    'SA1': {
//        "name":"region_map:FID_SA1_2011_AUST",
//        "regionProp": "SA1_7DIG11",
//        "aliases": ['sa1'],
//        "digits": 11
//    },
    'POA': {
        "name":"region_map:FID_POA_2011_AUST",
        "regionProp": "POA_CODE",
        "aliases": ['poa', 'postcode'],
        "digits": 4
    },
    'CED': {
        "name":"region_map:FID_CED_2011_AUST",
        "regionProp": "CED_CODE",
        "aliases": ['ced'],
        "digits": 3
    },
    'SED': {
        "name":"region_map:FID_SED_2011_AUST",
        "regionProp": "SED_CODE",
        "aliases": ['sed'],
        "digits": 5
    },
    'LGA': {
        "name":"region_map:FID_LGA_2011_AUST",
        "regionProp": "LGA_CODE11",
        "aliases": ['lga'],
        "digits": 5
    },
    'SSC': {
        "name":"region_map:FID_SCC_2011_AUST",
        "regionProp": "SSC_CODE",
        "aliases": ['ssc', 'suburb'],
        "digits": 5
    },
    'UN': {
        "name":"region_map:FID_TM_WORLD_BORDERS",
        "regionProp": "UN",
        "aliases": ['un', 'country'],
        "digits": 3
    }
};


//TODO: if we add enum capability and then can work with any unique field
function loadRegionIDs(regionDescriptor) {
    if (defined(regionDescriptor.idMap)) {
        return;
    }

    var url = regionServer + '?service=wfs&version=2.0&request=getPropertyValue';
    url += '&typenames=' + regionDescriptor.name;
    url += '&valueReference=' + regionDescriptor.regionProp;
    url = corsProxy.getURL(url);
    return loadText(url).then(function (text) { 
        var obj = $.xml2json(text);

        if (!defined(obj.member)) {
            return;
        }

        var idMap = [];
            //this turns ids into numbers since they are that way in table data
        for (var i = 0; i < obj.member.length; i++) {
            idMap.push(parseInt(obj.member[i][regionDescriptor.regionProp],10));
        }
        regionDescriptor.idMap = idMap;
    }, function(err) {
        console.log(err);
    });
}

function determineRegionVar(vars, aliases) {
    for (var i = 0; i < vars.length; i++) {
        var varName = vars[i].toLowerCase();
        for (var j = 0; j < aliases.length; j++) {
            if (varName.substring(0,aliases[j].length) === aliases[j]) {
                return i;
            }
        }
    }
    return -1;
}

function determineRegionType(dataset) {
    var vars = dataset.getVarList();

    var regionType, regionVar, region;
    //try to figure out the region variable
    for (region in regionWmsMap) {
        if (regionWmsMap.hasOwnProperty(region)) {
            var idx = determineRegionVar(vars, regionWmsMap[region].aliases);
            if (idx !== -1) {
                regionType = region;
                regionVar = vars[idx];
                break;
            }
        }
    }
    
    //if no match, try to derive regionType from region_id to use native abs census files
    if (!defined(regionType)) {
        var absRegion = 'region_id';
        if (vars.indexOf(absRegion) === -1) {
            return;
        }
        var code = dataset.getDataValue(absRegion, 0);
        if (typeof code === 'string') {
            region = code.replace(/[0-9]/g, '');
            if (!defined(regionWmsMap[region])) {
                return;
            }
            regionType = region;
            var vals = dataset.getDataValues(absRegion);
            var new_vals = [];
            for (var i = 0; i < vals.length; i++) {
                var id = dataset.getDataValue(absRegion, vals[i]).replace( /^\D+/g, '');
                new_vals.push(parseInt(id,10));
            }
            dataset.variables[absRegion].vals = new_vals;
        } else {
            var digits = code.toString().length;
            for (region in regionWmsMap) {
                if (regionWmsMap.hasOwnProperty(region)) {
                    if (digits === regionWmsMap[region].digits) {
                        regionType = region;
                        break;
                    }
                }
            }
        }
        if (defined(regionType)) {
            regionVar = regionType;
            dataset.variables[regionType] = dataset.variables[absRegion];
            delete dataset.variables[absRegion];
        }
    }
    return { regionType: regionType, regionVar: regionVar };
}

function createRegionLookupFunc(csvItem) {
    if (!defined(csvItem) || !defined(csvItem._tableDataSource) || !defined(csvItem._tableDataSource.dataset)) {
        return;
    }
    var dataSource = csvItem._tableDataSource;
    var dataset = dataSource.dataset;
    var regionDescriptor = regionWmsMap[csvItem.regionType];
 
    var codes = dataset.getDataValues(csvItem.regionVar);
    var vals = dataset.getDataValues(dataset.getCurrentVariable());
    var ids = regionDescriptor.idMap;
    var colors = new Array(ids.length);
    // set color for each code
    for (var i = 0; i < codes.length; i++) {
        var id = ids.indexOf(codes[i]);
        colors[id] = dataSource._mapValue2Color(vals[i]);
    }
    //   color lookup function used by the region mapper
    csvItem.colorFunc = function(id) {
        return colors[id];
    };
    // used to get current variable data
    csvItem.valFunc = function(code) {
        var rowIndex = codes.indexOf(code);
        return vals[rowIndex];
    };
    // used to get all region data properties
    csvItem.rowProperties = function(code) {
        var rowIndex = codes.indexOf(code);
        return dataset.getDataRow(rowIndex);
    };
}

function setRegionVariable(csvItem, regionVar, regionType) {
    if (!(csvItem._tableDataSource instanceof TableDataSource)) {
        return;
    }

    csvItem.regionVar = regionVar;
    var regionDescriptor = regionWmsMap[regionType];
    if (csvItem.regionType !== regionType) {
        csvItem.regionType = regionType;

        csvItem.regionServer = regionServer;
        csvItem.regionLayers = regionDescriptor.name;

        csvItem.regionProp = regionDescriptor.regionProp;
    }
    console.log('Region type:', csvItem.regionType, ', Region var:', csvItem.regionVar);
        
    return when(loadRegionIDs(regionDescriptor), function() {
        createRegionLookupFunc(csvItem);
        csvItem._regionMapped = true;
    });
}


function setRegionDataVariable(csvItem, newVar) {
    if (!(csvItem._tableDataSource instanceof TableDataSource)) {
        return;
    }

    var dataSource = csvItem._tableDataSource;
    var dataset = dataSource.dataset;
    dataset.setCurrentVariable({ variable: newVar});
    createRegionLookupFunc(csvItem);
    
    console.log('Var set to:', newVar);

    csvItem._rebuild();
}

function setRegionColorMap(csvItem, dataColorMap) {
     if (!(csvItem._tableDataSource instanceof TableDataSource)) {
        return;
    }

    csvItem._tableDataSource.setColorGradient(dataColorMap);
    createRegionLookupFunc(csvItem);

    csvItem._rebuild();
}


function addRegionMap(csvItem) {
    if (!(csvItem._tableDataSource instanceof TableDataSource)) {
        return;
    }

    var dataSource = csvItem._tableDataSource;
    var dataset = dataSource.dataset;
    csvItem.colorFunc = function(id) { return [0,0,0,0]; };
    if (dataset.rowCount === 0) {
        return;
    }

    //if csvItem includes style/var info then use that
    if (!defined(csvItem.style) || !defined(csvItem.style.table)) {
        var result = determineRegionType(dataset);
        if (!defined(result) || !defined(result.regionType)) {
            return;
        }
            //change current var if necessary
        var dataVar = dataset.getCurrentVariable();
        var vars = dataset.getVarList();

        if (vars.indexOf(dataVar) === -1 || dataVar === result.regionVar) {
            dataVar = (vars.indexOf(result.regionVar) === 0) ? vars[1] : vars[0];
        }
            //set default style if none set
        var style = {line: {}, point: {}, polygon: {}, table: {}};
        style.table.lat = undefined;
        style.table.lon = undefined;
        style.table.alt = undefined;
        style.table.regionVar = result.regionVar;
        style.table.regionType = result.regionType;
        style.table.time = dataset.getVarID(VarType.TIME);
        style.table.data = dataVar;
        style.table.colorMap = [
            {offset: 0.0, color: 'rgba(239,210,193,1.00)'},
            {offset: 0.25, color: 'rgba(221,139,116,1.0)'},
            {offset: 0.5, color: 'rgba(255,127,46,1.0)'},
            {offset: 0.75, color: 'rgba(255,65,43,1.0)'},
            {offset: 1.0, color: 'rgba(111,0,54,1.0)'}
        ];
        csvItem.style = style;
    }

    if (defined(csvItem.style.table.colorMap)) {
        dataSource.setColorGradient(csvItem.style.table.colorMap);
    }
    dataSource.setCurrentVariable(csvItem.style.table.data);

    //to make lint happy
    if (false) {
        setRegionColorMap();
        setRegionDataVariable();
    }
    
    //TODO: figure out how sharing works or doesn't
    
    return setRegionVariable(csvItem, csvItem.style.table.regionVar, csvItem.style.table.regionType);
}



module.exports = CsvCatalogItem;
