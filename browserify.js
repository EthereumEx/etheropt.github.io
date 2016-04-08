var Web3 = require('web3');
var utility = require('./utility.js');
var request = require('request');
var sha256 = require('js-sha256').sha256;
var async = (typeof(window) === 'undefined') ? require('async') : require('async/dist/async.min.js');

function Main() {
}
//functions
Main.alertInfo = function(message) {
  $('#log-container').css('display', 'block');
  $('#log').append($('<p>' + message + '</p>').hide().fadeIn(2000));
  $('#log').animate({scrollTop: $('#log').prop("scrollHeight")}, 500);
  console.log(message);
}
Main.alertTxHash = function(txHash) {
  // $('#splash-container').css('display', 'none');
  if (txHash) {
    Main.alertInfo('You just created an Ethereum transaction. Track its progress here: <a href="http://'+(config.eth_testnet ? 'morden' : 'live')+'.ether.camp/transaction/'+txHash+'" target="_blank">'+txHash+'</a>.');
  } else {
    Main.alertInfo('You tried to send an Ethereum transaction but there was an error. Check the Javascript console for details.');
  }
}
Main.tooltip = function(message) {
  return '<a href="#" data-toggle="tooltip" data-placement="bottom" title="'+message+'"><i class="fa fa-question-circle fa-lg"></i></a>';
}
Main.tooltips = function() {
  $(function () {
    $('[data-toggle="tooltip"]').tooltip()
  });
}
Main.popovers = function() {
  $(function () {
    $('[data-toggle="popover"]').popover()
  });
}
Main.createCookie = function(name,value,days) {
  if (localStorage) {
    localStorage.setItem(name, value);
  } else {
    if (days) {
      var date = new Date();
      date.setTime(date.getTime()+(days*24*60*60*1000));
      var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+value+expires+"; path=/";
  }
}
Main.readCookie = function(name) {
  if (localStorage) {
    return localStorage.getItem(name);
  } else {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
      var c = ca[i];
      while (c.charAt(0)==' ') c = c.substring(1,c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
  }
}
Main.eraseCookie = function(name) {
  if (localStorage) {
    localStorage.removeItem(name);
  } else {
    createCookie(name,"",-1);
  }
}
Main.logout = function() {
  addrs = [config.eth_addr];
  pks = [config.eth_addr_pk];
  selectedAddr = 0;
  Main.refresh();
}
Main.createAddress = function() {
  var newAddress = utility.createAddress();
  var addr = '0x'+newAddress[0].toString('hex');
  var pk = '0x'+newAddress[1].toString('hex');
  Main.addAddress(addr, pk);
  Main.alertInfo('You just created an Ethereum address: '+addr+'.');
}
Main.deleteAddress = function() {
  addrs.splice(selectedAddr, 1);
  pks.splice(selectedAddr, 1);
  selectedAddr = 0;
  Main.refresh();
}
Main.order = function(option, price, size, order, expires, gas) {
  option = JSON.parse(option);
  order = JSON.parse(order);
  size = utility.ethToWei(size);
  price = price * 1000000000000000000;
  gas = Number(gas);
  expires = Number(expires);
  var matchSize = 0;
  if (order && ((size>0 && order.size<0 && price>=order.price) || (size<0 && order.size>0 && price<=order.price))) {
    if (Math.abs(size)<=Math.abs(order.size)) {
      matchSize = size;
    } else {
      matchSize = -order.size;
    }
    size = size - matchSize;
    var deposit = utility.ethToWei(0);
    utility.call(web3, myContract, option.contract_addr, 'orderMatchTest', [order.optionID, order.price, order.size, order.orderID, order.blockExpires, order.addr, addrs[selectedAddr], deposit, matchSize], function(result) {
      if (result) {
        utility.send(web3, myContract, option.contract_addr, 'orderMatch', [order.optionID, order.price, order.size, order.orderID, order.blockExpires, order.addr, order.v, order.r, order.s, matchSize, {gas: gas, value: deposit}], addrs[selectedAddr], pks[selectedAddr], nonce, function(result) {
          txHash = result[0];
          nonce = result[1];
          Main.alertInfo('Some of your order ('+utility.weiToEth(Math.abs(matchSize))+' eth) was sent to the blockchain to match against a resting order. ');
          Main.alertTxHash(txHash);
        });
      } else {
        Main.alertInfo('You tried to match against a resting order but the order match failed. This can be because the order expired or traded already, or either you or the counterparty do not have enough funds to cover the trade. ');
      }
    });
  }
  logMessage = '';
  if (size!=0) {
    utility.call(web3, myContract, option.contract_addr, 'getMarketMakers', [], function(result) {
      var market_makers = result.filter(function(x){return x!=''});
      utility.blockNumber(web3, function(blockNumber) {
        var orderID = utility.getRandomInt(0,Math.pow(2,64));
        var blockExpires = blockNumber + expires;
        var condensed = utility.pack([option.optionID, price, size, orderID, blockExpires], [256, 256, 256, 256, 256]);
        var hash = sha256(new Buffer(condensed,'hex'));
        utility.sign(web3, addrs[selectedAddr], hash, pks[selectedAddr], function(sig) {
          if (!sig) {
            logMessage += 'You tried sending an order to the order book, but it could not be signed. ';
            Main.alertInfo(logMessage);
          } else {
            var order = {contract_addr: option.contract_addr, optionID: option.optionID, price: price, size: size, orderID: orderID, blockExpires: blockExpires, addr: addrs[selectedAddr], v: sig.v, r: sig.r, s: sig.s, hash: '0x'+hash};
            condensed = utility.pack([order.optionID, order.price, order.size, order.orderID, order.blockExpires], [256, 256, 256, 256, 256]);
            hash = '0x'+sha256(new Buffer(condensed,'hex'));
            var verified = utility.verify(web3, order.addr, order.v, order.r, order.s, order.hash);
            utility.call(web3, myContract, option.contract_addr, 'getFunds', [order.addr, false], function(result) {
              var balance = result.toNumber();
              utility.call(web3, myContract, option.contract_addr, 'getMaxLossAfterTrade', [order.addr, order.optionID, order.size, -order.size*order.price], function(result) {
                balance = balance + result.toNumber();
                if (!verified) {
                  logMessage += 'You tried sending an order to the order book, but signature verification failed. ';
                  Main.alertInfo(logMessage);
                } else if (balance<=0) {
                  logMessage += 'You tried sending an order to the order book, but you do not have enough funds to place your order. You need to add '+(utility.weiToEth(-balance))+" eth to your account to cover this trade. ";
                  Main.alertInfo(logMessage);
                } else if (blockNumber<=order.blockExpires && verified && hash==order.hash && balance>=0) {
                  setTimeout(function () {
                    Main.loadPrices(options_cache, function(options) {
                      options_cache = options;
                      contracts_cache.forEach(function(contract){
                        new EJS({url: config.home_url+'/'+'contract_prices.ejs'}).update(contract.contract_addr+'_prices', {contract: contract, options: options_cache, addr: addrs[selectedAddr]});
                      });
                    });
                  }, 2000);
                  async.each(market_makers,
                    function(market_maker, callback) {
                      request.post(market_maker, {form:{orders: [order]}}, function(err, httpResponse, body) {
                        callback();
                      });
                    },
                    function(err) {
                      logMessage += 'Some of your order ('+utility.weiToEth(Math.abs(size))+' eth) could not be matched immediately so it was sent to the order book. ';
                      Main.alertInfo(logMessage);
                    }
                  );
                }
              });
            });
          }
        });
      });
    });
  }
}
Main.selectAddress = function(i) {
  nonce = undefined;
  selectedAddr = i;
  Main.refresh();
}
Main.addAddress = function(addr, pk) {
  if (addr.slice(0,2)!='0x') addr = '0x'+addr;
  if (pk.slice(0,2)=='0x') pk = pk.slice(2);
  if (pk!=undefined && pk!='' && !utility.verifyPrivateKey(addr, pk)) {
    Main.alertInfo('For account '+addr+', the private key is invalid.');
  } else if (!web3.isAddress(addr)) {
    Main.alertInfo('The specified address, '+addr+', is invalid.');
  } else {
    addrs.push(addr);
    pks.push(pk);
    selectedAddr = addrs.length-1;
    Main.refresh();
  }
}
Main.showPrivateKey = function() {
  var addr = addrs[selectedAddr];
  var pk = pks[selectedAddr];
  if (pk==undefined || pk=='') {
    Main.alertInfo('For account '+addr+', there is no private key available. You can still transact if you are connected to Geth and the account is unlocked.');
  } else {
    Main.alertInfo('For account '+addr+', the private key is '+pk+'.');
  }
}
Main.shapeshift_click = function(a,e) {
  e.preventDefault();
  var link=a.href;
  window.open(link,'1418115287605','width=700,height=500,toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=0,left=0,top=0');
  return false;
}
Main.fund = function(amount, contract_addr) {
  utility.send(web3, myContract, contract_addr, 'addFunds', [{gas: 200000, value: utility.ethToWei(amount)}], addrs[selectedAddr], pks[selectedAddr], nonce, function(result) {
    txHash = result[0];
    nonce = result[1];
    Main.alertTxHash(txHash);
  });
}
Main.withdraw = function(amount, contract_addr) {
  amount = utility.ethToWei(amount);
  utility.send(web3, myContract, contract_addr, 'withdrawFunds', [amount, {gas: 300000, value: 0}], addrs[selectedAddr], pks[selectedAddr], nonce, function(result) {
    txHash = result[0];
    nonce = result[1];
    Main.alertTxHash(txHash);
  });
}
Main.connectionTest = function() {
  if (connection) return connection;
  connection = {connection: 'Proxy', provider: 'http://'+(config.eth_testnet ? 'testnet.' : '')+'etherscan.io', testnet: config.eth_testnet};
  try {
    if (web3.currentProvider) {
      web3.eth.getBalance('0x0000000000000000000000000000000000000000');
      connection = {connection: 'Geth', provider: config.eth_provider, testnet: config.eth_testnet};
    }
  } catch(err) {
    web3.setProvider(undefined);
  }
  new EJS({url: config.home_url+'/'+'connection.ejs'}).update('connection', {connection: connection});
  Main.popovers();
  return connection;
}
Main.loadAddresses = function() {
  if (Main.connectionTest().connection=='Geth') {
    $('#pk_div').hide();
  }
  if (addrs.length<=0 || addrs.length!=pks.length) {
    addrs = [config.eth_addr];
    pks = [config.eth_addr_pk];
    selectedAddr = 0;
  }
  async.map(addrs,
    function(addr, callback) {
      utility.getBalance(web3, addr, function(balance) {
        callback(null, {addr: addr, balance: balance});
      });
    },
    function(err, addresses) {
      new EJS({url: config.home_url+'/'+'addresses.ejs'}).update('addresses', {addresses: addresses, selectedAddr: selectedAddr});
    }
  );
}
Main.displayMarket = function(callback) {
  if (contracts_cache && options_cache) {
    new EJS({url: config.home_url+'/'+'market.ejs'}).update('market', {options: options_cache, contracts: contracts_cache});
    contracts_cache.forEach(function(contract){
      new EJS({url: config.home_url+'/'+'contract_nav.ejs'}).update(contract.contract_addr+'_nav', {contract: contract, options: options_cache});
      new EJS({url: config.home_url+'/'+'contract_prices.ejs'}).update(contract.contract_addr+'_prices', {contract: contract, options: options_cache, addr: addrs[selectedAddr]});
    });
    $('#market-spinner').hide();
    Main.tooltips();
    if (callback) callback();
  } else {
    $('#market-spinner').show();
    Main.loadContractsFunds(function(contracts){
      contracts_cache = contracts;
      Main.loadOptions(function(options){
        options_cache = options;
        Main.loadPrices(options_cache, function(options){
          options_cache = options;
          Main.displayMarket();
          Main.loadLog(events_cache, function(events){
            events_cache = events;
            if (callback) callback();
          });
        });
      });
    });
  }
}
Main.loadPrices = function(options, callback) {
  async.reduce(config.contract_addrs, [],
    function(memo, contract_addr, callback_reduce){
      var options_filtered = options.filter(function(x){return x.contract_addr==contract_addr})
      if (options_filtered.length>0) {

        if (options_filtered[0].timer) clearInterval(options_filtered[0].timer);
        options_filtered[0].last_updated = Date.now();
        options_filtered[0].timer = setInterval(function () {
          function pad(val) {return val > 9 ? val : "0" + val;}
          var sec = Math.ceil((Date.now() - options_filtered[0].last_updated) / 1000);
          document.getElementById(contract_addr+"_updated").innerHTML = (pad(parseInt(sec / 60, 10)))+":"+(pad(++sec % 60));
        }, 1000);

        var market_makers = options_filtered[0].market_makers;
        async.reduce(market_makers, [],
          function(memo, market_maker, callback_reduce) {
            request.get(market_maker+'/'+contract_addr, function(err, httpResponse, body) {
              try {
                callback_reduce(null, memo.concat(JSON.parse(body)));
              } catch (err) {
                callback_reduce(null, memo);
              }
            });
          },
          function(err, markets){
            callback_reduce(null, memo.concat(markets));
          }
        );
      } else {
        callback_reduce(null, memo);
      }
    },
    function(err, markets){
      async.map(options,
        function(option, callback_map){
          var orders = markets.filter(function(x){return x.contract_addr==option.contract_addr && x.optionID==option.optionID});
          orders = orders.map(function(x){return {size: Math.abs(x.size), price: x.price/1000000000000000000, order: x}});
          option.buy_orders = orders.filter(function(x){return x.order.size>0});
          option.sell_orders = orders.filter(function(x){return x.order.size<0});
          option.buy_orders.sort(function(a, b) {return b.price > a.price ? 1 : (b.price == a.price ? (b.size > a.size ? 1 : -1) : -1)});
          option.sell_orders.sort(function(a, b) {return b.price < a.price ? 1 : (b.price == a.price ? (b.size > a.size ? 1 : -1) : -1)});
          callback_map(null, option);
        },
        function(err, options){
          callback(options);
        }
      );
    }
  );
}
Main.loadPositions = function(options_original, callback) {
  async.map(config.contract_addrs,
    function(contract_addr, callback) {
      utility.call(web3, myContract, contract_addr, 'getMarket', [addrs[selectedAddr]], function(result) {
        if (result) {
          var optionIDs = result[0];
          var strikes = result[1];
          var positions = result[2];
          var cashes = result[3];
          var is = [];
          for (var i=0; i<optionIDs.length; i++) {
            if (strikes[i].toNumber()!=0) is.push(i);
          }
          async.map(is,
            function(i, callback_map) {
              var cash = cashes[i].toNumber() / 1000000000000000000;
              var position = positions[i].toNumber();
              var option = {cash: cash, position: position, optionID: optionIDs[i], contract_addr: contract_addr};
              callback_map(null, option);
            },
            function(err, options) {
              callback(null, options);
            }
          );
        } else {
          callback(null, []);
        }
      });
    },
    function(err, options) {
      options = options.reduce(function(a, b) {return a.concat(b);}, []);
      async.map(options_original,
        function(option, callback_map) {
          for (var i=0; i<options.length; i++) {
            if (options[i].contract_addr==option.contract_addr && options[i].optionID==option.optionID) {
              option.position = options[i].position;
              option.cash = options[i].cash;
              return callback_map(null, option);
            }
          }
          callback_map(null, option);
        },
        function(err, options) {
          callback(options);
        }
      );
    }
  );
}
Main.loadLog = function(events, callback) {
  async.each(config.contract_addrs,
    function(contract_addr, callback_each){
      utility.logs(web3, myContract, contract_addr, 0, 'latest', function(event) {
        if (!events[contract_addr]) events[contract_addr] = {};
        event.tx_link = 'http://'+(config.eth_testnet ? 'morden' : 'live')+'.ether.camp/transaction/'+event.transactionHash;
        events[contract_addr][event.transactionHash] = event;
        var events_unique = Object.values(events[contract_addr]);
        events_unique.sort(function(a,b){ return a.blockNumber*1000+a.transactionIndex>b.blockNumber*1000+b.transactionIndex ? -1 : 1 });
        new EJS({url: config.home_url+'/'+'contract_log.ejs'}).update(contract_addr+'_log', {events: events_unique, options: options_cache.filter(function(x){return x.contract_addr==contract_addr})});
      });
      callback_each();
    },
    function (err) {
      callback(events);
    }
  );
}
Main.loadContractsFunds = function(callback) {
  async.map(config.contract_addrs,
    function(contract_addr, callback) {
      utility.call(web3, myContract, contract_addr, 'getFundsAndAvailable', [addrs[selectedAddr]], function(result) {
        if (result) {
          var funds = result[0].toString();
          var fundsAvailable = result[1].toString();
          var contract_link = 'http://'+(config.eth_testnet ? 'morden' : 'live')+'.ether.camp/account/'+contract_addr;
          callback(null, {contract_addr: contract_addr, contract_link: contract_link, funds: funds, fundsAvailable: fundsAvailable});
        } else {
          callback(null, undefined);
        }
      });
    },
    function(err, contracts) {
      contracts = contracts.filter(function(x){return x!=undefined});
      callback(contracts);
    }
  );
}
Main.loadOptions = function(callback) {
  async.mapSeries(config.contract_addrs,
    function(contract_addr, callback) {
      utility.call(web3, myContract, contract_addr, 'getOptionChain', [], function(result) {
        if (result) {
          var expiration = (new Date(result[0].toNumber()*1000)).toISOString().substring(0,10);
          var fromcur = result[1].split("/")[0];
          var tocur = result[1].split("/")[1];
          var margin = result[2].toNumber() / 1000000000000000000.0;
          var realityID = result[3].toNumber();
          utility.call(web3, myContract, contract_addr, 'getMarket', [addrs[selectedAddr]], function(result) {
            if (result) {
              var optionIDs = result[0];
              var strikes = result[1];
              var positions = result[2];
              var cashes = result[3];
              var is = [];
              for (var i=0; i<optionIDs.length; i++) {
                if (strikes[i].toNumber()!=0) is.push(i);
              }
              var optionChainDescription = {expiration: expiration, fromcur: fromcur, tocur: tocur, margin: margin, realityID: realityID};
              utility.call(web3, myContract, contract_addr, 'getMarketMakers', [], function(result) {
                if (result) {
                  var market_makers = result ? result.filter(function(x){return x!=''}) : [];
                  async.map(is,
                    function(i, callback_map) {
                      var optionID = optionIDs[i].toNumber();
                      var strike = strikes[i].toNumber() / 1000000000000000000;
                      var cash = cashes[i].toNumber() / 1000000000000000000;
                      var position = positions[i].toNumber();
                      var option = Object();
                      if (strike>0) {
                        option.kind = 'Call';
                      } else {
                        option.kind = 'Put';
                      }
                      option.strike = Math.abs(strike);
                      option.optionID = optionID;
                      option.cash = cash;
                      option.position = position;
                      option.contract_addr = contract_addr;
                      option.market_makers = market_makers;
                      option.expiration = optionChainDescription.expiration;
                      option.fromcur = optionChainDescription.fromcur;
                      option.tocur = optionChainDescription.tocur;
                      option.margin = optionChainDescription.margin;
                      callback_map(null, option);
                    },
                    function(err, options) {
                      callback(null, options);
                    }
                  );
                } else {
                  callback(null, []);
                }
              });
            } else {
              callback(null, []);
            }
          });
        } else {
          callback(null, []);
        }
      });
    },
    function(err, options) {
      options = options.reduce(function(a, b) {return a.concat(b);}, []);
      options.sort(function(a,b){ return a.expiration+(a.strike+10000000).toFixed(3).toString()+a.kind<b.expiration+(b.strike+10000000).toFixed(3).toString()+b.kind ? -1 : 1 });
      callback(options);
    }
  );
}
Main.draw_chart = function(element, title, data_rows, x_label, y_label, columns) {
  var data = new google.visualization.DataTable();
  data.addColumn('number', x_label);
  columns.forEach(function(column){
    data.addColumn(column);
  });
  data.addRows(data_rows);
  var options = {
    hAxis: {title: x_label},
    vAxis: {title: y_label},
    legend: {position: 'none'},
    enableInteractivity: true,
    title: title
  };
  var chart = new google.visualization.LineChart(document.getElementById(element));
  chart.draw(data, options);
}
Main.draw_option_chart = function(element, option, price, size) {
  if (option.kind=='Call') {
    var data = [];
    data.push([Math.max(option.strike-option.margin*1,0),size*(-price),null,null]);
    var label = size>0 ? 'Max loss' : 'Max profit';
    data.push([option.strike,size*(-price),label,label]);
    for (var x = option.strike; x<option.strike+option.margin; x+=option.margin/20.0) {
      data.push([x,size*(-price+(x-option.strike)),null,null]);
    }
    label = size<0 ? 'Max loss' : 'Max profit';
    data.push([option.strike+option.margin,size*(-price+option.margin),label,label]);
    data.push([option.strike+2*option.margin,size*(-price+option.margin),null,null]);
    var action = size>0 ? 'Buy' : 'Sell';
    Main.draw_chart(element, action+" "+Math.abs(size)+" eth of the "+option.strike+" Call "+" for "+price, data, "ETH/USD price", "Net profit (eth)", [{type: 'number', role: null}, {type: 'string', role: 'annotation'}, {type: 'string', role: 'annotationText'}]);
  } else if (option.kind=='Put') {
    var data = [];
    data.push([Math.max(option.strike-option.margin*2,0),size*(-price+option.margin),null,null]);
    var label = size<0 ? 'Max loss' : 'Max profit';
    data.push([option.strike-option.margin,size*(-price+option.margin),label,label]);
    for (var x = option.strike-option.margin; x<option.strike; x+=option.margin/20.0) {
      data.push([x,size*(-price+(option.strike-x)),null,null]);
    }
    label = size>0 ? 'Max loss' : 'Max profit';
    data.push([option.strike,size*(-price),label,label]);
    data.push([option.strike+1*option.margin,size*(-price),null,null]);
    var action = size>0 ? 'Buy' : 'Sell';
    Main.draw_chart(element, action+" "+Math.abs(size)+" eth of the "+option.strike+" Put "+" for "+price, data, "ETH/USD price", "Net profit (eth)", [{type: 'number', role: null}, {type: 'string', role: 'annotation'}, {type: 'string', role: 'annotationText'}]);
  }
}
Main.refresh = function() {
  Main.createCookie("user", JSON.stringify({"addrs": addrs, "pks": pks, "selectedAddr": selectedAddr}), 999);
  Main.connectionTest();
  Main.loadAddresses();
  Main.loadContractsFunds(function(contracts){
    contracts_cache = contracts;
    Main.loadPositions(options_cache, function(options){
      options_cache = options;
      contracts_cache.forEach(function(contract){
        new EJS({url: config.home_url+'/'+'contract_nav.ejs'}).update(contract.contract_addr+'_nav', {contract: contract, options: options_cache});
        new EJS({url: config.home_url+'/'+'contract_prices.ejs'}).update(contract.contract_addr+'_prices', {contract: contract, options: options_cache, addr: addrs[selectedAddr]});
      });
    });
  });
}
Main.init = function() {
  Main.createCookie("user", JSON.stringify({"addrs": addrs, "pks": pks, "selectedAddr": selectedAddr}), 999);
  Main.connectionTest();
  Main.loadAddresses();
  Main.displayMarket(function(){
    function priceLoop() {
      Main.loadPrices(options_cache, function(options) {
        options_cache = options;
        contracts_cache.forEach(function(contract){
          new EJS({url: config.home_url+'/'+'contract_prices.ejs'}).update(contract.contract_addr+'_prices', {contract: contract, options: options_cache, addr: addrs[selectedAddr]});
        });
        setTimeout(priceLoop, 10*1000);
      });
    }
    priceLoop();
  });
}

//globals
var addrs = [config.eth_addr];
var pks = [config.eth_addr_pk];
var selectedAddr = 0;
var cookie = Main.readCookie("user");
if (cookie) {
  cookie = JSON.parse(cookie);
  addrs = cookie["addrs"];
  pks = cookie["pks"];
  selectedAddr = cookie["selectedAddr"];
}
var connection = undefined;
var nonce = undefined;
var events_cache = {};
var contracts_cache = undefined;
var options_cache = undefined;
//web3
var web3 = new Web3();
var myContract = undefined;
web3.eth.defaultAccount = config.eth_addr;
web3.setProvider(new web3.providers.HttpProvider(config.eth_provider));
utility.readFile(config.contract_market+'.bytecode', function(bytecode){
  utility.readFile(config.contract_market+'.interface', function(abi){
    abi = JSON.parse(abi);
    bytecode = JSON.parse(bytecode);
    myContract = web3.eth.contract(abi);
    myContract = myContract.at(config.contract_addr);
    Main.init(); //iniital load
  });
});

module.exports = {Main: Main, utility: utility};
