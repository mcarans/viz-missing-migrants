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

    var timeDimension = cf.dimension(function(d){return new Date(d['#date+reported']);});
    var minDate = new Date(timeDimension.bottom(1)[0]['#date+reported']);
    var maxDate = new Date(timeDimension.top(1)[0]['#date+reported']);

    var incidentDimension = cf.dimension(function(d){return d['#affected+regionincident']});
    var originDimension = cf.dimension(function(d){return d['#affected+regionorigin']});
    var causeDimension = cf.dimension(function(d){return d['#affected+cause+killed']});

    var timeGroup = timeDimension.group(function(d) {return new Date(d.getFullYear(),d.getMonth());}).reduceSum(function(d){return (d['#affected+killed'] + d['#affected+missing'])});
    var incidentGroup = incidentDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing'])});
    var originGroup = originDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing'])});
    var causeGroup = causeDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing'])});
    // var routeGroup = routeDimension.group().reduceSum(function(d){return d['#x_value']});
    var totalGroup = cf.groupAll().reduceSum(function(d){return (d['#affected+killed'] + d['#affected+missing'])});

    var tip = d3.tip().attr('class', 'd3-tip').html(function(d) { return d.data.key+': '+d3.format('0,000')(d.data.value); });
    var rowtip = d3.tip().attr('class', 'd3-tip').html(function(d) { return d.key+': '+d3.format('0,000')(d.value); });   

    timeChart = dc.barChart('#time').height(180).width($('#time').width())
        .dimension(timeDimension)
        .group(timeGroup)
        .x(d3.time.scale().domain([minDate, maxDate]))
        .xUnits(d3.time.months)
        .renderHorizontalGridLines(true)
        .centerBar(true) 
        .elasticY(true)
        .margins({top: 10, right: 50, bottom: 65, left: 50});

    timeChart.yAxis().ticks(3);
    var xAxis = timeChart.xAxis().tickFormat(d3.time. format('%b %Y'));

    var incidentChart = dc.rowChart('#regionIncident').height(220).width($('#regionIncident').width())
        .dimension(incidentDimension)
        .group(incidentGroup)
        .data(function(group){
            return group.top(5);
        })
        .colors(['#cccccc',color])
        .colorDomain([0,1])
        .colorAccessor(function(d, i){return 1;})        
        .elasticX(true)
        .margins({top: 10, right: 15, bottom: 40, left: 15});

    incidentChart.xAxis().ticks(3);
    incidentChart.renderlet(function(chart){
        selectedFilters();
    });

    var originChart = dc.rowChart('#regionOrigin').height(220).width($('#regionOrigin').width())
        .dimension(originDimension)
        .group(originGroup)
        .data(function(group){
            return group.top(5);
        })
        .colors(['#cccccc',color])
        .colorDomain([0,1])
        .colorAccessor(function(d, i){return 1;})        
        .elasticX(true)
        .margins({top: 10, right: 15, bottom: 40, left: 15})
        .xAxis().ticks(3);

    var causeChart = dc.rowChart('#cause').height(220).width($('#cause').width())
        .dimension(causeDimension)
        .group(causeGroup)
        .data(function(group){
            return group.top(5);
        })
        .colors(['#cccccc',color])
        .colorDomain([0,1])
        .colorAccessor(function(d, i){return 1;})        
        .elasticX(true)
        .margins({top: 10, right: 15, bottom: 40, left: 15})
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
}

function initMap(geom){
    var geoData = [];
    var allDimension = cf.dimension(function(d){
        geoData.push([d['#loc+x'], d['#loc+y']]);
    });

    var width = $('#map').width()-50,
    height = $('#map').height();

    var svg = d3.select('#map').append('svg')
        .attr('width', width)
        .attr('height', height);

    var projection = d3.geo.mercator()
        .center([0, 0])
        .scale(width/6.2)
        .translate([width / 2, height / 1.5]);    

    svg.selectAll('path')
      .data(geom.features)
      .enter().append('path')
      .attr('d', d3.geo.path().projection(projection))
      .attr('class','country')
      .attr('id',function(d){
        return 'country'+d.properties.ISO_A3;
      });

    svg.selectAll('circle')
        .data(geoData).enter()
        .append('circle')
        .attr('cx', function (d) { return projection(d)[0]; })
        .attr('cy', function (d) { return projection(d)[1]; })
        .attr('r', '3px')
        .attr('fill', 'rgba(0,119,190,0.5)')
        //.attr('stroke', '#333');
}

function selectedFilters(){
    var str = '';
    for (var chart of dc.chartRegistry.list()){ 
        //console.log(chart.anchor(), chart.filters())
        str += 'For time period x, incident region y, region of origin z, cause w';
    }
    //$('#selectedFilters')
}

function dateByQuarter(d){
    var date = new Date(d);
    var month = date.getMonth();
    var year = date.getFullYear();
    if (month <= 2) {
        return year+' Q1';
    } else if (month > 2 && month <= 5) {
        return year+' Q2';
    } else if (month > 5 && month <= 8) {
        return year+' Q3';
    } else {
        return year+' Q4';
    }
}

function zoomToGeom(geom){
    var bounds = d3.geo.bounds(geom);
    map.fitBounds([[bounds[0][1],bounds[0][0]],[bounds[1][1],bounds[1][0]]]);
}   

function autoAdvance(){
    if(time==25){
        timeChart.filter([quarters[time-1]]);
        dc.redrawAll();
        time+=1;
        clearInterval(timer);
    }    
    if(time<25 && time>0){
        timeChart.filter([quarters[time-1]]);
        timeChart.filter([quarters[time]]);
        dc.redrawAll();
        time+=1;
    }
    if(time==0){
        timeChart.filter([quarters[time]]);
        dc.redrawAll();
        time+=1;
    }    
} 

function dataReplace(data){
    var routeReplace = [
        'Western Balkan Route',
        'Black sea Route',
        'Central Mediterranean Route',
        'Circular Route from Albania to Greece',
        'Eastern borders Route',
        'Eastern Mediterranean Route',
        'Western African Route',
        'Western Mediterranean Route'
    ];

    data.forEach(function(d,i){
        if(i>0){
            d[0]=routeReplace[d[0]];
        }
    })
    return data;
}

var colors = ['#ccc','#ffffb2','#fecc5c','#fd8d3c','#e31a1c'];

var color = '#1f77b4';

var dataurl = 'https://proxy.hxlstandard.org/data.json?strip-headers=on&url=https%3A//docs.google.com/spreadsheets/d/16cKC9a1v20ztkhY29h5nIDEPFKWIm6Z97Y4D54TyZr8/edit%3Fusp%3Dsharing';
var geomurl = 'data/worldmap.json';

var time;
var timer;
var timeChart;
var cf;

//var quarters = ['2014 Q1','2014 Q2','2014 Q3','2014 Q4','2015 Q1','2015 Q2','2015 Q3','2015 Q4','2016 Q1','2016 Q2','2016 Q3','2016 Q4'];

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


$('#timeplay').on('click',function(){
    time =0;
    timer = setInterval(function(){autoAdvance()}, 2000);
});

$('#clearfilters').on('click',function(){
    dc.filterAll();
    dc.redrawAll();
   // zoomToGeom(routes_geom);
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
                position: 'left'
              },
              {
                element: '#time',
                intro: "Here we can see the number of people missing or dead by quarter by year.  Click a bar or multiple bars to see data for that quarter.  The animate button can be used to progress time automatically.  You could, for example, click Mediterranean as region of incident and then click animate to see how Mediterranean migrants have been affected over time.",
              },
              {
                element: '#map',
                intro: "The map can zoomed and panned.  Click a migration route to filter the dashboard for that route.",
              },
              {
                element: '#total',
                intro: "This number is the total number of missing and dead migrants that match the selected filters on the graphs and map.",
              },
              {
              element: '#clearfilters',
                intro: "Click here at anytime to reset the dashboard.",
              },                           
            ]
        });  
    intro.start();
});
