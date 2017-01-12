function hxlProxyToJSON(input){
    var output = [];
    var keys=[]
    input.forEach(function(e,i){
        if(i==0){
            keys = e;
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
        d['#affected+killed'] = checkIntData(d['#affected+killed']);
        d['#affected+missing'] = checkIntData(d['#affected+missing']);
        d['#affected+regionincident'] = checkData(d['#affected+regionincident']);
        d['#affected+regionorigin'] = checkData(d['#affected+regionorigin']);
        d['#affected+cause+killed'] = checkData(d['#affected+cause+killed']);
        if(d['#date+reported']==""){d['#date+reported']='2014/01/01'}
    });

    var parseDate = d3.time.format("%Y/%m/%d").parse;

    var timeDimension = cf.dimension(function(d){return parseDate(d['#date+reported'].substr(0,10));});
    minDate = d3.min(data,function(d){return parseDate(d['#date+reported'].substr(0,10));});
    maxDate = d3.max(data,function(d){return parseDate(d['#date+reported'].substr(0,10));});

    var incidentDimension = cf.dimension(function(d){return d['#affected+regionincident'];});
    var originDimension = cf.dimension(function(d){return d['#affected+regionorigin'];});
    var causeDimension = cf.dimension(function(d){return d['#affected+cause+killed'];});

    var timeGroup = timeDimension.group(function(d) {return d3.time.month(d);}).reduceSum(function(d){return (d['#affected+killed'] + d['#affected+missing']);});
    var incidentGroup = incidentDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing']);});
    var originGroup = originDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing']);});
    var causeGroup = causeDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing']);});
    var totalGroup = cf.groupAll().reduceSum(function(d){return (d['#affected+killed'] + d['#affected+missing']);});

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
        if(mapinit){updateMap(incidentDimension.top(Infinity));}
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
            return d
        })
        .formatNumber(function(d){
            return d3.format("0,000")(parseInt(d));;
        })           
        .group(totalGroup);        

    dc.renderAll();

    d3.selectAll('.bar').call(tip);
    d3.selectAll('.bar').on('mouseover', tip.show).on('mouseout', tip.hide);

    d3.selectAll('g.row').call(rowtip);
    d3.selectAll('g.row').on('mouseover', rowtip.show).on('mouseout', rowtip.hide);   

    $('#selectedFilters').html('<p id="selectedFilters">For time period <span>'+formatDate(minDate)+' – '+formatDate(maxDate)+'</span></p>');             
}

var mapsvg, mapzoom, rlog, scaleMin, scaleMax;
var mapZoomLevel = 1;
function initMap(geom){
    mapinit = true;

    var parseDate = d3.time.format("%Y/%m/%d").parse;
    var geoData = [];
    var allDimension = cf.dimension(function(d){
        geoData.push({loc:[d['#loc+x'], d['#loc+y']], date: parseDate(d['#date+reported'].substr(0,10)), total: d['#affected+killed'] + d['#affected+missing'], region: d['#affected+regionincident']});
    });

    var margin = {top: 20, right: 0, bottom: 20, left: 10};
    var width = $('#map').width() - margin.right,
        height = $('#map').height();

    totalMin = d3.min(geoData, function(d){ return d.total; });
    totalMax = d3.max(geoData, function(d){ return d.total; });

    rlog = d3.scale.log()
        .domain([1, totalMax])
        .range([2, 8]);

    mapsvg = d3.select('#map').append('svg')
        .attr('width', width)
        .attr('height', height);

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

    //print location labels 
    // g.selectAll('.label')
    //     .data(geom.features)
    //     .enter().append('text')
    //     .attr('class', 'label')
    //     .attr('transform', function(d) { console.log(d); return 'translate(' + projection(d.geometry.coordinates[0][0]) + ')'; })
    //     .attr('dy', '.35em')
    //     .text(function(d) { return d.properties.NAME; });

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

    //map zoom
    scalemin = 1;
    scalemax = 8;
    mapzoom = d3.behavior.zoom().scaleExtent([scalemin, scalemax]).on('zoom', function() {
        mapZoomLevel = d3.event.scale;
        zoomMap(d3.event.translate.join(','), mapZoomLevel);
    });
    mapsvg.call(mapzoom);

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
        .attr('class', 'zoomin')
        .html('+');

    var zoomOut = d3.select('#map')
        .append('div')
        .attr('class', 'zoomout')
        .html('–');

    zoomIn.on('click', function(){
        mapZoomLevel = mapZoomLevel + 0.5;
        if (mapZoomLevel <= scalemax){
            var translate =  -(width / 2) + ',' + -(height / 2);
            zoomMap(translate, mapZoomLevel);
        }
    });
    zoomOut.on('click', function(){
        mapZoomLevel = mapZoomLevel - 0.5;
        if (mapZoomLevel >= scalemin){
            var translate =  -(width / 2) + ',' + -(height / 2);
            zoomMap(translate, mapZoomLevel);
        }
    });
}

function updateMap(data){
    var geoData = [];
    var parseDate = d3.time.format("%Y/%m/%d").parse;
    data.forEach(function(d){
        geoData.push({loc:[d['#loc+x'], d['#loc+y']], date: parseDate(d['#date+reported'].substr(0,10)), total: d['#affected+killed'] + d['#affected+missing'], region: d['#affected+regionincident']});
    });
    d3.selectAll('.incident').remove();

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

function zoomMap(translate, scale){
    var g = d3.select('#map').select('svg').select('g');
    g.attr('transform', 'translate(' + translate + ') scale(' + scale + ')');
    g.selectAll('circle')
        .attr('r', function (d) { return (d.total==0) ? rlog(1)/mapzoom.scale() : rlog(d.total)/mapzoom.scale(); });
    g.selectAll('path').style('stroke-width', (scalemax/mapzoom.scale())/10);

    // var fontlog = d3.scale.log()
    //     .domain([12, 2])
    //     .range([1, 8]);
    // g.selectAll('.label').style('font-size', Math.floor(fontlog(mapzoom.scale()))+'px');
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
    return (d=='' || d=='Unknown') ? 'No Data' : d;
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
var dataurl = 'https://proxy.hxlstandard.org/data.json?strip-headers=on&url=https%3A//docs.google.com/spreadsheets/d/16cKC9a1v20ztkhY29h5nIDEPFKWIm6Z97Y4D54TyZr8/edit%3Fusp%3Dsharing';
var geomurl = 'data/worldmap.json';
var formatDate = d3.time.format('%m/%d/%Y');
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

var data, geom;
$.when(
    // get data
    $.get(dataurl).done(function(d){
        data = d;
    }),

    // get geom
    $.get(geomurl).done(function(result){
        geom = topojson.feature(result,result.objects.geom);
    })
).then(function() {
    data = hxlProxyToJSON(data);
    generateDashboard(data);
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
