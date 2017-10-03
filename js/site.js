function hxlProxyToJSON(input){
    var output = [];
    var keys=[]
    input.forEach(function(e,i){
        if(i==0){
            e.forEach(function(e2,i2){
                var parts = e2.split('+');
                var key = parts[0]
                if(parts.length>1){
                    var atts = parts.splice(1,parts.length);
                    atts.sort();                    
                    atts.forEach(function(att){
                        key +='+'+att
                    });
                }
                keys.push(key);
            });
        } else {
            var row = {};
            e.forEach(function(e2,i2){
                row[keys[i2]] = e2;
            });
            output.push(row);
        }
    });
    return output;
}

function generateDashboard(data){
    cf = crossfilter(data);

    data.forEach(function(d){
        d['#affected+dead'] = checkIntData(d['#affected+dead']);
        d['#affected+missing'] = checkIntData(d['#affected+missing']);
        d['#region+incident'] = checkData(d['#region+incident']);
        d['#region+origin'] = checkData(d['#region+origin']);
        d['#cause+type'] = checkData(d['#cause+type']);
        d['#geo+lon'] = checkGeoData(d['#geo+lon']);
        d['#geo+lat'] = checkGeoData(d['#geo+lat']);
        if(d['#date+reported']=="" || d['#date+reported']==null){d['#date+reported']='01/01/2014'}
    });

    var timeDimension = cf.dimension(function(d){return parseDate(d['#date+reported']);});
    minDate = d3.min(data,function(d){return parseDate(d['#date+reported']);});
    maxDate = d3.max(data,function(d){return parseDate(d['#date+reported']);});

    var incidentDimension = cf.dimension(function(d){return d['#region+incident'];});
    var originDimension = cf.dimension(function(d){return d['#region+origin'];});
    var causeDimension = cf.dimension(function(d){return d['#cause+type'];});

    var timeGroup = timeDimension.group(function(d) {return d3.time.month(d);}).reduceSum(function(d){return (d['#affected+dead'] + d['#affected+missing']);});
    var incidentGroup = incidentDimension.group().reduceSum(function(d){ return (d['#affected+dead'] + d['#affected+missing']);});
    var originGroup = originDimension.group().reduceSum(function(d){ return (d['#affected+dead'] + d['#affected+missing']);});
    var causeGroup = causeDimension.group().reduceSum(function(d){ return (d['#affected+dead'] + d['#affected+missing']);});
    var totalGroup = cf.groupAll().reduceSum(function(d){return (d['#affected+dead'] + d['#affected+missing']);});

    var tip = d3.tip().attr('class', 'd3-tip').html(function(d) { return d.data.key+': '+d3.format('0,000')(d.data.value); });
    var rowtip = d3.tip().attr('class', 'd3-tip').html(function(d) { return d.key+': '+d3.format('0,000')(d.value); });    

    timeChart = dc.barChart('#time').height(215).width($('#time').width())
        .dimension(timeDimension)
        .group(timeGroup)
        .x(d3.time.scale().domain([minDate, maxDate]))
        .xUnits(d3.time.months)
        .renderHorizontalGridLines(true)
        .elasticY(true)
        .margins({top: 10, right: 0, bottom: 65, left: 40});

    timeChart.yAxis().ticks(3);
    var xAxis = timeChart.xAxis().tickFormat(d3.time.format('%b %Y'));

    timeChart.on("pretransition", function(chart){
        selectedFilters();
        if(mapinit){updateMap(incidentDimension);}
    });

    var incidentChart = dc.rowChart('#regionIncident').height(680).width($('#regionIncident').width())
        .dimension(incidentDimension)
        .group(incidentGroup)
        .data(function(group){
            return group.top(100);
        })
        .colors(['#cccccc',color])
        .colorDomain([0,1])
        .colorAccessor(function(d, i){return 1;})        
        .elasticX(true)
        .margins({top: 10, right: 20, bottom: 40, left: 15})
        .xAxis().ticks(3);

    var originChart = dc.rowChart('#regionOrigin').height(680).width($('#regionOrigin').width())
        .dimension(originDimension)
        .group(originGroup)
        .data(function(group){
            return group.top(100);
        })
        .colors(['#cccccc',color])
        .colorDomain([0,1])
        .colorAccessor(function(d, i){return 1;})        
        .elasticX(true)
        .margins({top: 10, right: 20, bottom: 40, left: 15})
        .xAxis().ticks(3);

    var causeChart = dc.rowChart('#cause').height(220).width($('#cause').width())
        .dimension(causeDimension)
        .group(causeGroup)
        .data(function(group){
            return group.top(6);
        })
        .colors(['#cccccc',color])
        .colorDomain([0,1])
        .colorAccessor(function(d, i){return 1;})        
        .elasticX(true)
        .margins({top: 10, right: 20, bottom: 40, left: 15})
        .xAxis().ticks(3);

    var numberMissingDead = dc.numberDisplay("#number")
        .valueAccessor(function(d){
            return d;
        })
        .formatNumber(function(d){
            return d3.format("0,000")(parseInt(d));
        })           
        .group(totalGroup);        

    dc.renderAll();

    d3.selectAll('.bar').call(tip);
    d3.selectAll('.bar').on('mouseover', tip.show).on('mouseout', tip.hide);

    d3.selectAll('g.row').call(rowtip);
    d3.selectAll('g.row').on('mouseover', rowtip.show).on('mouseout', rowtip.hide);   

    $('#selectedFilters').html('<p id="selectedFilters">For time period <span>'+formatDate(minDate)+' – '+formatDate(maxDate)+'</span></p>');             
}

var mapsvg, mapzoom, rlog, labellog;
function initMap(geom){
    mapinit = true;
    var geoData = [];
    var regionData = [];

    var allDimension = cf.dimension(function(d){
        geoData.push({loc:[d['#geo+lon'], d['#geo+lat']], date: parseDate(d['#date+reported'].substr(0,10)), total: d['#affected+dead'] + d['#affected+missing'], region: d['#region+incident']});
    });

    //combine region data with counts
    var regionDimension = cf.dimension(function(d){ return d['#region+incident']; });
    var regionGroup = regionDimension.group().reduceSum(function(d){ return (d['#affected+dead'] + d['#affected+missing']);});
    for (var i=0;i<regionGroup.all().length;i++){
        var coords;
        for (var j=0;j<regions.length;j++){
            if (regions[j].region==regionGroup.all()[i].key){
                coords = regions[j].coordinates;
                break;
            }
        }
        if (regionGroup.all()[i].key!='No Data') regionData.push({name: regionGroup.all()[i].key, total: regionGroup.all()[i].value, coordinates: coords});
    }

    var margin = {top: 20, right: 0, bottom: 20, left: 10};
    var width = $('#map').width() - margin.right,
        height = $('#map').height();

    totalMin = d3.min(geoData, function(d){ return d.total; });
    totalMax = d3.max(geoData, function(d){ return d.total; });
    mapzoom = d3.behavior.zoom().scaleExtent([1, 8]).on('zoom', zoomMap);

    //create log scale for circle markers
    rlog = d3.scale.log()
        .domain([1, totalMax])
        .range([2, 8]);

    //create log scale for region labels
    labellog = d3.scale.log()
        .domain([1, 8])
        .range([12, 3]);

    mapsvg = d3.select('#map').append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(mapzoom);

    var projection = d3.geo.mercator()
        .center([0, 0])
        .scale(width/6.2)
        .translate([width / 2, height / 1.5]);    

    var g = mapsvg.append('g');

    g.selectAll('path')
      .data(geom.features)
      .enter().append('path')
      .attr('d', d3.geo.path().projection(projection))
      .attr('class','country')
      .attr('id',function(d){
        return 'country'+d.properties.ISO_A3;
      });

    //create region labels
    var region = g.selectAll('text')
        .data(regionData).enter()
        .append('text')
        .attr('class', 'label')
        .style('font-size', function (d) { return Math.round(labellog(mapzoom.scale())); })
        .attr("transform", function(d) {
          return "translate(" + projection([(d.coordinates)[0], (d.coordinates)[1]]) + ")";
        })
        .text(function(d){ return d.name + ': ' + formatNumber(d.total); });

    //create marker locations
    var circle = g.selectAll('circle')
        .data(geoData).enter()
        .append('circle')
        .attr('class','incident')
        .attr('r', function (d) { return (d.total==0) ? rlog(1) : rlog(d.total); })
        .attr("transform", function(d) {
          return "translate(" + projection([(d.loc)[0], (d.loc)[1]]) + ")";
        });

    circle
        .attr('fill-opacity', 0)
        .attr('fill', '#0077be')
        .transition()
        .delay( function(d, i){ return 0.5*i; })
        .duration(400)
        .attr('fill-opacity', 0.5);

    //map tooltips
    var maptip = d3.select('#map').append('div').attr('class', 'd3-tip map-tip hidden');
    circle
        .on('mousemove', function(d,i) {
            var mouse = d3.mouse(mapsvg.node()).map( function(d) { return parseInt(d); } );
            maptip
                .classed('hidden', false)
                .attr('style', 'left:'+(mouse[0]+20)+'px;top:'+(mouse[1]+20)+'px')
                .html(formatDate(d.date)+' '+d.region+': '+d3.format('0,000')(d.total))
        })
        .on('mouseout',  function(d,i) {
            maptip.classed('hidden', true)
        }); 

    //create map legend
    var threshold = d3.scale.threshold()
        .domain([2, 4, 6, 8])
        .range(['1-'+Math.round(totalMax*0.25),
                Math.round((totalMax*0.25)+1)+'-'+Math.round(totalMax*0.5),
                Math.round((totalMax*0.5)+1)+'-'+Math.round(totalMax*0.75),
                Math.round((totalMax*0.75)+1)+'-'+totalMax]);

    var legend = d3.select('#maplegend')
        .append('ul');

    var keys = legend.selectAll('li')
        .data(threshold.range())
        .enter().append('li');

    keys.append('div').append('div')
        .attr('class', 'marker')
        .style('height', function(d){
            var r = threshold.invertExtent(d);
            return (r[1]*2);
        })
        .style('width', function(d){
            var r = threshold.invertExtent(d);
            return (r[1]*2);
        });
    keys.append('div')
        .attr('class', 'key')
        .html(function(d){ return d;});
    $('#maplegend').show();

    //create zoom control
    var zoomIn = d3.select('#map')
        .append('div')
        .attr('class', 'zoomBtn')
        .attr('id','zoom-in')
        .html('+');

    var zoomOut = d3.select('#map')
        .append('div')
        .attr('class', 'zoomBtn')
        .attr('id','zoom-out')
        .html('–');

    zoomIn.on('click', zoomClick);
    zoomOut.on('click', zoomClick);
}

function updateMap(data){
    var geoData = [];
    var regionData = [];
    data.top(Infinity).forEach(function(d){
        geoData.push({loc:[d['#geo+lon'], d['#geo+lat']], date: parseDate(d['#date+reported'].substr(0,10)), total: d['#affected+dead'] + d['#affected+missing'], region: d['#region+incident']});
    });
    d3.selectAll('.incident').remove();
    d3.selectAll('.label').remove();


    //combine region data with counts
    var regionGroup = data.group().reduceSum(function(d){ return (d['#affected+dead'] + d['#affected+missing']);});
    for (var i=0;i<regionGroup.all().length;i++){
        var coords;
        for (var j=0;j<regions.length;j++){
            if (regions[j].region==regionGroup.all()[i].key){
                coords = regions[j].coordinates;
                break;
            }
        }
        if (regionGroup.all()[i].key!='No Data') regionData.push({name: regionGroup.all()[i].key, total: regionGroup.all()[i].value, coordinates: coords});
    }

    totalMax = d3.max(geoData, function(d){ return d.total; });

    var svg = d3.select('#map').select('svg')
    var g = d3.select('#map').select('svg').select('g');

    var margin = {top: 20, right: 0, bottom: 20, left: 10};
    var width = $('#map').width() - margin.right,
        height = $('#map').height();

    var rlog = d3.scale.log()
        .domain([1, totalMax])
        .range([2, 8]);

    var projection = d3.geo.mercator()
        .center([0, 0])
        .scale(width/6.2)
        .translate([width / (2), height / (1.5)]);    

    //create region labels
    var region = g.selectAll('text')
        .data(regionData).enter()
        .append('text')
        .attr('class', 'label')
        .style('font-size', function (d) { return Math.round(labellog(mapzoom.scale())); })
        .attr("transform", function(d) {
          return "translate(" + projection([(d.coordinates)[0], (d.coordinates)[1]]) + ")";
        })
        .text(function(d){ return d.name + ': ' + formatNumber(d.total); });

    var circle = g.selectAll('circle')
        .data(geoData).enter()
        .append('circle')
        .attr('cx', function (d) { return projection(d.loc)[0]; })
        .attr('cy', function (d) { return projection(d.loc)[1]; })
        .attr('r', function (d) { return (d.total==0) ? rlog(1)/mapzoom.scale() : rlog(d.total)/mapzoom.scale(); })
        .attr('fill-opacity', 0.5)
        .attr('fill', '#0077be')
        .attr('class','incident');

    //map tooltips
    var maptip = d3.select('.d3-tip');

    circle
        .on('mousemove', function(d,i) {
            var mouse = d3.mouse(svg.node()).map( function(d) { return parseInt(d); } );
            maptip
                .classed('hidden', false)
                .attr('style', 'left:'+(mouse[0]+20)+'px;top:'+(mouse[1]+20)+'px')
                .html(formatDate(d.date)+' '+d.region+': '+d3.format('0,000')(d.total))
        })
        .on('mouseout',  function(d,i) {
            maptip.classed('hidden', true)
        });

    updateLegend(totalMax);
}

function updateLegend(max){
    var keys = $('#maplegend .key');
    var lowrange = 1;
    for (var i=0;i<keys.length;i++){
        var multiplier = (i+1)/keys.length;
        var highrange = Math.round(max*multiplier);
        $(keys[i]).html(lowrange + '–' + highrange);
        lowrange = highrange+1;
    }
}

function zoomMap(){
    var g = d3.select('#map').select('svg').select('g');
    g.attr('transform', 'translate(' + mapzoom.translate() + ') scale(' + mapzoom.scale() + ')');
    g.selectAll('circle')
        .attr('r', function (d) { return (d.total==0) ? rlog(1)/mapzoom.scale() : rlog(d.total)/mapzoom.scale(); });
    g.selectAll('path').style('stroke-width', (mapzoom.scaleExtent()[1]/mapzoom.scale()) / 10);
    g.selectAll('.label')
        .style('font-size', function(d) { return Math.round(labellog(mapzoom.scale())); })
}

function interpolateZoom(translate, scale) {
    var self = this;
    return d3.transition().duration(350).tween('zoom', function () {
        var iTranslate = d3.interpolate(mapzoom.translate(), translate),
            iScale = d3.interpolate(mapzoom.scale(), scale);
        return function (t) {
            mapzoom
                .scale(iScale(t))
                .translate(iTranslate(t));
            zoomMap();
        };
    });
}

function zoomClick() {
    var clicked = d3.event.target,
        direction = 1,
        factor = 0.2,
        target_zoom = 1,
        center = [mapsvg.attr('width') / 2, mapsvg.attr('height') / 2],
        extent = mapzoom.scaleExtent(),
        translate = mapzoom.translate(),
        translate0 = [],
        l = [],
        view = {x: translate[0], y: translate[1], k: mapzoom.scale()};

    d3.event.preventDefault();
    direction = (this.id === 'zoom-in') ? 1 : -1;
    target_zoom = mapzoom.scale() * (1 + factor * direction);

    if (target_zoom < extent[0] || target_zoom > extent[1]) { return false; }

    translate0 = [(center[0] - view.x) / view.k, (center[1] - view.y) / view.k];
    view.k = target_zoom;
    l = [translate0[0] * view.k + view.x, translate0[1] * view.k + view.y];

    view.x += center[0] - l[0];
    view.y += center[1] - l[1];

    interpolateZoom([view.x, view.y], view.k);
}

function selectedFilters(){
    //get selected filter data
    var filterArray = [];
    for (var chart of dc.chartRegistry.list()){ 
        if (chart.filters().length>0) filterArray.push({chart: chart.anchor(), chartTag:$(chart.anchor()).attr('data-tag'), filters: chart.filters()});
    }

    //format selected filter data
    var str = (filterArray.length>0) ? 'For ' : '';
    for (var i=0; i<filterArray.length; i++){
        var filters = '';
        if (filterArray[i].chart=='#time'){
            var fromDate = new Date(filterArray[i].filters[0][0]);
            var toDate = new Date(filterArray[i].filters[0][1]);
            filters = '<span>'+formatDate(fromDate)+' – '+formatDate(toDate)+'</span>';
        }
        else{
            $.each(filterArray[i].filters, function( j, val ){
              filters += (j==filterArray[i].filters.length-1) ? '<span>'+val+'</span>' : '<span>'+val+'</span>, ';
            }); 
        }
        var strEnd = (i==filterArray.length-1) ? '' : ', ';
        if (filters!='') str += filterArray[i].chartTag+' '+filters + strEnd;
    }
    $('#selectedFilters').html(str);
}

function checkData(d){
    return (d=='' || d=='Unknown' || d==null) ? 'No Data' : d;
}

function checkGeoData(d){
    return (d=='' || d=='Unknown' || d==null) ? 0 : d;
}

function checkIntData(d){
    return (isNaN(parseInt(d)) || parseInt(d)<0) ? 0 : parseInt(d);
}

var start, end, next;
function autoAdvance(){
    if (time==0){
        start = d3.time.month(minDate);
        end = d3.time.month(maxDate);
        next = new Date(start);
        next.setDate(next.getDate()+30);
        time+=1;
    }
    else{
        start.setDate(start.getDate()+4);
        if (next.getTime()>=end.getTime()){
            resetAnimation(true);
        }
    }

    next.setDate(next.getDate()+4);
    timeChart.filter(null);
    timeChart.filter(dc.filters.RangedFilter(start, next));
    dc.redrawAll();
} 

function resetAnimation(restart){
    $('#timeplay').html('Animate graph');
    isAnimating = false;
    if (restart) time = 0;
    clearInterval(timer);
}

var colors = ['#ccc','#ffffb2','#fecc5c','#fd8d3c','#e31a1c'];
var color = '#1f77b4';
var dataurl = 'data/HDX.json';
//https://missingmigrants.iom.int/global-figures/2017/HDXjson';//https://dtmodk.iom.int/dtm_mpphxl/MMP_HXL.asmx/GetJsonMinified';
var geomurl = 'data/worldmap.json';
var regionsurl = 'data/regions.json';
var formatDate = d3.time.format('%m/%d/%Y');
var parseDate = d3.time.format("%d/%m/%Y").parse;
var formatNumber = d3.format(',');
var isAnimating = false;
var time = 0;

var timer,
    timeChart,
    cf,
    minDate,
    maxDate,
    totalMin,
    totalMax;

var mapinit = false;

$('#modal').modal('show');

var data, geom, regions;
$.when(
    // get data
    $.get(dataurl).done(function(d){
        data = d;
    }),

    // get regions
    $.get(regionsurl).done(function(result){
        regions = result.regions;
    }),

    // get geom
    $.get(geomurl).done(function(result){
        geom = topojson.feature(result,result.objects.geom);
    })
).then(function() {
    generateDashboard(hxlProxyToJSON(data));
    initMap(geom);
    
    $('#modal').modal('hide'); 
});

//reload page on window orientation change to reset svg dimensions
$(window).on('orientationchange',function(){
    location.reload();
});

$('#timeplay').on('click',function(){
    if (!isAnimating){
        $(this).html('Pause animation');
        isAnimating = true;
        timer = setInterval(function(){autoAdvance()}, 250);
    }
    else{
        resetAnimation(false);
    }
});

$('#clearfilters').on('click',function(){
    resetAnimation(true);
    dc.filterAll();
    dc.redrawAll();
    mapsvg.selectAll('g').attr('transform', 'translate(0,0) scale(1)');
});

$('#intro').click(function(){
    var intro = introJs();
        intro.setOptions({
            steps: [
              {
                element: '#regionIncident',
                intro: "This graph shows the number of missing or dead migrants by region of incident.  A region or multiple regions can be clicked to filter the dashboard.",
                position: 'left'
              },
              {
                element: '#regionOrigin',
                intro: "This graph shows the number of missing or dead migrants by region of origin.  A region or multiple regions can be clicked to filter the dashboard.",
                position: 'left'
              },
              {
                element: '#cause',
                intro: "This graph shows the cause of migrant death.  A cause or multiple causes can be clicked to filter the dashboard.",
              },
              {
                element: '#time',
                intro: "Here we can see the number of people missing or dead by month.  Click a bar or multiple bars to see data for that time period.  The animate button can be used to progress time automatically.  You could, for example, click Mediterranean as region of incident and then click animate to see how Mediterranean migrants have been affected over time.",
              },
              {
                element: '#map',
                intro: "The map can be zoomed with the mousewheel or by double-clicking and panned by dragging.  Hover over a marker to see more information about migrant deaths in that location.",
              },
              {
                element: '#total',
                intro: "This number is the total number of missing or dead migrants that match the selected filters on the graphs and map.",
              },
              {
              element: '#clearfilters',
                intro: "Click here at anytime to reset the dashboard.",
                position: 'right'
              },                           
            ]
        });  
    intro.start();
});
