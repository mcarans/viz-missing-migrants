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
    minDate = new Date(timeDimension.bottom(1)[0]['#date+reported']);
    maxDate = new Date(timeDimension.top(1)[0]['#date+reported']);

    var incidentDimension = cf.dimension(function(d){return checkData(d['#affected+regionincident'])});
    var originDimension = cf.dimension(function(d){return checkData(d['#affected+regionorigin'])});
    var causeDimension = cf.dimension(function(d){return checkData(d['#affected+cause+killed'])});

    var timeGroup = timeDimension.group(function(d) {return d3.time.month(d);}).reduceSum(function(d){return (d['#affected+killed'] + d['#affected+missing'])});
    var incidentGroup = incidentDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing'])});
    var originGroup = originDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing'])});
    var causeGroup = causeDimension.group().reduceSum(function(d){ return (d['#affected+killed'] + d['#affected+missing'])});
    var totalGroup = cf.groupAll().reduceSum(function(d){return (d['#affected+killed'] + d['#affected+missing'])});

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

    timeChart.renderlet(function(chart){
        selectedFilters();
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
}

function initMap(geom){ 
    var geoData = [];
    var allDimension = cf.dimension(function(d){
        geoData.push({loc:[d['#loc+x'], d['#loc+y']], date: d['#date+reported'], total: d['#affected+killed'] + d['#affected+missing'], region: d['#affected+regionincident']});
    });
    var maptip = d3.tip().attr('class', 'd3-tip').html(function(d) { return d.region+': '+d3.format('0,000')(d.total); }); 

    var margin = {top: 20, right: 0, bottom: 20, left: 10};
    var width = $('#map').width() - margin.right,
        height = $('#map').height();

    var svg = d3.select('#map').append('svg')
        .attr('width', width)
        .attr('height', height);

    var projection = d3.geo.mercator()
        .center([0, 0])
        .scale(width/6.2)
        .translate([width / 2, height / 1.5]);    

    var g = svg.append('g');

    g.selectAll('path')
      .data(geom.features)
      .enter().append('path')
      .attr('d', d3.geo.path().projection(projection))
      .attr('class','country')
      .attr('id',function(d){
        return 'country'+d.properties.ISO_A3;
      });

    g.selectAll('circle')
        .data(geoData).enter()
        .append('circle')
        .attr('cx', function (d) { return projection(d.loc)[0]; })
        .attr('cy', function (d) { return projection(d.loc)[1]; })
        .attr('r', '2px')
        .attr('fill', 'rgba(0,119,190,0.5)')
      .on('mouseover', maptip.show)
      .on('mouseout', maptip.hide);

    var zoom = d3.behavior.zoom().scaleExtent([1, 8]).on('zoom', function() {
        g.attr('transform', 'translate(' + d3.event.translate.join(',') + ') scale(' + d3.event.scale + ')');
    });
    svg.call(zoom);

    svg.call(maptip);
}

function selectedFilters(){
    //get selected filter data
    var filterArray = [];
    for (var chart of dc.chartRegistry.list()){ 
        if (chart.filters().length>0) filterArray.push({chart: chart.anchor(), chartTag:$(chart.anchor()).attr('data-tag'), filters: chart.filters()});
    }

    //format selected filter data
    var formatDate = d3.time.format("%m/%d/%Y");
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

var start, end, next;
function autoAdvance(){
    if (time==0){
        start = d3.time.month(minDate);
        end = d3.time.month(maxDate);
        next = new Date(start);
        time+=1;
    }
    else{
        start.setMonth(start.getMonth()+1);
        if (next.getTime()>=end.getTime()){
            clearInterval(timer);
        }
    }

    next.setMonth(next.getMonth()+1);
    timeChart.filter(null);
    timeChart.filter(dc.filters.RangedFilter(start, next));
    dc.redrawAll();
} 

var colors = ['#ccc','#ffffb2','#fecc5c','#fd8d3c','#e31a1c'];
var color = '#1f77b4';
var dataurl = 'https://proxy.hxlstandard.org/data.json?strip-headers=on&url=https%3A//docs.google.com/spreadsheets/d/16cKC9a1v20ztkhY29h5nIDEPFKWIm6Z97Y4D54TyZr8/edit%3Fusp%3Dsharing';
var geomurl = 'data/worldmap.json';

var time,
    timer,
    timeChart,
    cf,
    minDate,
    maxDate;

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

//reload page on window resize to reset svg dimensions
$(window).resize(function(){
    location.reload();
});

$('#timeplay').on('click',function(){
    time = 0;
    timer = setInterval(function(){autoAdvance()}, 2000);
});

$('#clearfilters').on('click',function(){
    dc.filterAll();
    dc.redrawAll();
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
