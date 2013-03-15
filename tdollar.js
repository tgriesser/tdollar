//
// tdollar.js
// With code, patterns, and conventions from Ender, jQuery, and Zepto
//
// @author Tim Griesser
// @license MIT
//
(function (Tdollar) {

  module.exports = Tdollar();

})(function () {

  var ioc = require('ioc');
  var _ = ioc.resolve('underscore');

  // Setup the root $ object, accepting two arguments, the
  // element name, and the attributes for that element (this isn't jQuery)
  // which we'll try to convert into a $ object if not already done for us
  var $ = function (ti, attr) {
    if (ti instanceof $) return ti;
    return elementMixins(new $.O.$(ti, attr));
  };

  // Shortcut version of $ without the instanceof and mixins
  var $$ = function (ti) {
    return new $.O.$(ti);
  };

  $.prototype = $.O = {

    context: null,

    length: 0,

    $: function (ti, attr) {
      
      // handle empty sets
      if (!ti) return this;

      if (_.isArray(ti)) {
        
        var count = 0;
        
        _.each(ti, function (el) {
          if (_.has(el, '_$tid')) {
            this[count] = el;
            count++;
          } else {
            logger("Warn", "Tried to add a non TDollar element on the stack " + JSON.stringify(el));
          }
        }, this);

        if (count === 0) return this;

        this.length = count;
        this.context = this[0];
        return this;
      }

      if (ti._$tid) {
        this.length = 1;
        this.context = this[0] = ti;
        return this;
      }

      this.length = 1;
      this.context = this[0] = makeUI(ti, attr);
      return this;
    },

    // Core Helpers

    each: function (fn) {
      return fauxEach(this, fn);
    },

    map: function (fn) {
      return fauxMap(this, fn);
    },

    find: function (selector) {
      return $(finder(selector, this.context));
    },

    // General Insertion & Deletion

    // Unlike the regular jQuery/Zepto - this .add
    // call just forges a new item with the specified tagName
    // and attributes, and pushes it onto the current element
    // context, setting a reference to the parent element
    add: function(tagName, attributes) {
      
      var el;
      var parent = this.context;

      if (_.isString(tagName)) {
        el = makeUI(tagName, attributes);
      } else if (tagName._$tid) {
        el = tagName;
      } else {
        tagName = $(tagName);
        el = tagName.context;
        if (!el._$id && el.id) {
          el._$id = el.id;
        }
      }

      if (!el._$parent) el._$parent = parent;
        
      if (parent._$tagName === 'TabGroup' && el._$tagName === 'Tab') {
      
        parent.addTab(el);
      
      } else {
        
        // Set the _$containingTab reference when adding a Window to a tab
        if (parent._$tagName === 'Tab' && el._$tagName === 'Window') {
          el._$containingTab = parent;
        }
        
        parent.add(el);
      }
      
      return this;
    },

    // Remove every item inside the current context,
    // by finding the child elements, calling .empty
    // on them, and then calling remove on the children
    empty: function() {
      return this.each(function () {
        var that = this;
        $$(childEls(this)).each(function() {
          $$(this).off().empty();
          removeElement(that, this);
          delete this._$parent;
        });
      });
    },

    // Returns the number of elements on the
    // current stack
    size: function () {
      return this.length;
    },

    // Removes the current item
    remove: function () {
      return this.each(function() {
        if (this._$parent) {
          $$(this).empty();
          removeElement(this._$parent, this);
          delete this._$parent;
          delete this._$containingTab;
        } else if (this._$tagName !== 'Window') {
          return console.log('Cannot remove an item without knowledge of the parent');
        }
      });
    },

    // Traversal & Selection

    first: function () {
      return $(this[0]);
    },

    last: function () {
      return $(this[this.length-1]);
    },

    at: function (id) {
      return $(this[id]);
    },

    // Returns the parent for the first item on the
    // stack
    parent: function () {
      return $(this.context._$parent);
    },

    // Properties

    el: function () {
      return this.context;
    },

    val: function () {
      return this.context.getValue();
    },

    // Get or set attribute on the current stack
    attr: function (name, attribute) {
      // Exit early if we're getting an attribute
      if (_.isString(name) && attribute == null) {
        return this.context['get'+ucFirst(name)]();
      }

      return this.each(function () {
        if (_.isString(name)) {
          setAttr(this, name, attribute);
        } else if (_.isObject(name)) {
          for (var key in name) {
            setAttr(this, key, _val(name[key]));
          }
        }
      });

    },

    hasClass: function () {
      return classRegex(this.context._$className);
    },

    // Display elements
    show: function () {
      return this.each(function () {
        this.setVisible(true);
      });
    },

    // Hide the items
    hide: function () {
      return this.each(function () {
        this.setVisible(false);
      });
    },

    // Shows or hides items based on their
    // visibility status
    toggle: function () {
      return this.each(function () {
        if (this.visible === false) {
          this.setVisible(true);
        } else {
          this.setVisible(false);
        }
      });
    }
  
  };

  $.O.$.prototype = $.O;

  // Animation
  // -------

  _.extend($.O, {
    animate: function (options, callback) {
      this.context.animate(makeUI('animation', options), callback);
      return this;
    }
  });


  // Events & Event Binding
  // -------

  var handlers = {};

  function matcherFor(ns) {
    return new RegExp("(?:^| )" + ns.replace(" ", " .* ?") + "(?: |$)");
  }

  function eventParser(event) {
    var parts = ("" + event).split(".");
    return {
      e: parts[0],
      ns: parts.slice(1).sort().join(" ")
    };
  }

  function findHandlers(element, event, fn) {
    var matcher;
    event = eventParser(event);
    if (event.ns) {
      matcher = matcherFor(event.ns);
    }
    return (handlers[element._$tid] || []).filter(function(handler) {
      return handler &&
        (!event.e || handler.e === event.e) &&
        (!event.ns || matcher.test(handler.ns)) &&
        (!fn || handler.fn === fn);
    });
  }

  function eachEvent(events, fn, iterator) {
    if (_.isObject(events)) {
      _.each(events, function (value, key) {
        iterator(key, value);
      });
    } else {
      _.each(events.split(/\s/), function(type) {
        iterator(type, fn);
      });
    }
  }

  // Adds an event on an element
  function addEvent(element, events, fn, getDelegate) {
    var id = element._$tid;
    var set = handlers[id] || (handlers[id] = []);
    
    eachEvent(events, fn, function(event, fn) {
    
      var delegate = getDelegate && getDelegate(fn, event);
      var callback = delegate || fn;
      
      var proxyfn = function(event) {
        return callback.apply(element, [event].concat(event.data));
      };
      
      var handler = _.extend(eventParser(event), {
        fn: fn,
        proxy: proxyfn,
        del: delegate,
        i: set.length
      });
      set.push(handler);
      
      element.addEventListener(handler.e, proxyfn);
    });
  }

  function removeEvent(element, events, fn) {
    var id = element._$tid;
    return eachEvent(events || "", fn, function(event, fn) {
      return findHandlers(element, event, fn).forEach(function(handler) {
        delete handlers[id][handler.i];
        return element.removeEventListener(handler.e, handler.proxy);
      });
    });
  }

  _.extend($.O, {
    
    // Binds an event to a callback,
    // or a hash of events to callbacks
    on: function(event, callback) {
      return this.each(function() {
        addEvent(this, event, callback);
      });
    },
    
    // Removes an event from an element,
    // either by the event name, the namespace
    // or the callback
    off: function(event, callback) {
      return this.each(function() {
        removeEvent(this, event, callback);
      });
    },
    
    // Binds an event to a callback for
    // a single execution only
    one: function(event, callback) {
      return this.each(function(i, element) {
        addEvent(this, event, callback, function(fn, type) {
          return function() {
            var result = fn.apply(element, arguments);
            removeEvent(element, type, fn);
            return result;
          };
        });
      });
    }

  });

  // General helper functions
  // -------

  // Global "Stylesheet" param - override with your own
  // $.Stylesheet = ...your styles
  $.Stylesheet = {};

  var classRegexCache = {};

  function classRegex(name) {
    if (_.has(classCache, name)) return classRegexCache[name];
    return classRegexCache[name] = new RegExp('(^|\\s)' + name + '(\\s|$)');
  }

  function logger(type, message) {
    if (!message) {
      message = type;
      type = 'Log';
    }
    console.log(type + ': ' + message);
  }

  // Returns the child elements for the current ui element
  function childEls(ui) {
    if (ui._$tagName === 'TabGroup') {
      children = ui.tabs;
    } else if (ui._$tagName === 'TableViewSection') {
      children = ui.rows;
    } else {
      children =  ui.children;
    }
    return children;
  }

  // Makes an Ti.UI element from scratch, parsing
  // the id, class, tag attributes from the stylesheet,
  // adding a _$tid property for reference.
  function makeUI(tagName, attr) {
    var el;
    attr || (attr = {});

    if (_.isString(tagName)) {
      el = Ti.UI["create"+tagName](parseAttr(tagName, attr));
    } else {
      el = tagName;
      tagName = 'View';
    }

    el._$className || (el._$className = '');
    el._$tagName = tagName;
    el._$tid = _.uniqueId('tid');
    
    if (tagName === 'Tab' && attr.window && attr.window._$tid) {
      attr.window._$containingTab = el;
    }

    return el;
  }

  // Parses the attribtues based on the tagName
  function parseAttr(tagName, attr) {
    
    attr || (attr = {});
    
    var classAttr, idAttr;
    
    // Generate the stylesheet for building this element
    var stylesheet = _.extend({}, _.result($, 'Stylesheet'), _.result(attr, 'stylesheet'));
    
    // Delete the stylesheet key if it exists
    if (_.has(attr, 'stylesheet')) delete attr.stylesheet;

    var tagAttr = _.result(stylesheet, tagName);
    
    if (_.has(attr, 'className')) {
      
      attr._$className = _.result(attr, 'className');
      
      // TODO: check here for the TableViewRow
      delete attr.className;
      
      classAttr = _.reduce(_.map(attr._$className.split(' '), function(cName) {
        return _.result(stylesheet, "." + cName);
      }), function (memo, val) {
        return _.extend({}, memo, val);
      });
    }
    
    if (attr.id) {
      attr._$id = _.result(attr, 'id');
      delete attr.id;
      idAttr = _.result(stylesheet, "#" + attr._$id);
    }
    
    var data = _.extend({}, tagAttr, classAttr, idAttr, attr);

    _.each(data, function (value, key, list) {
      if (_.isFunction(value)) value = list[key] = value();
      if (value instanceof $) list[key] = value.el();
    });

    return data;
  }

  // @param $
  // @param function
  // @return $
  function fauxMap(tdollar, callback) {
    var i = 0, values = [];
    while (i < tdollar.length) {
      values.push(callback(tdollar[i], i));
      i++;
    }
    return $(_.flatten(values, true));
  }

  // @param $
  // @param function
  // @return $
  function fauxEach(tdollar, callback) {
    var i = 0;
    while (i < tdollar.length) {
      callback.call(tdollar[i], i, tdollar[i]);
      i++;
    }
    return tdollar;
  }

  // Removes an element
  // @param {Ti.UI}
  // @param {Ti.UI}
  function removeElement(parent, child) {
    
    if (child._$containingTab) delete child._$containingTab;
    
    if (parent._$tagName === 'TabGroup' && child._$tagName === 'Tab') {
      parent.removeTab(child);
    } else if (parent._$tagName === 'TabGroup') {
      parent.remove(child);
      logger('Warn', 'Trying to remove a non tab from a tab group?');
    } else {
      parent.remove(child);
    }
  }

  // A very, very simple selector function
  // for now, it allows multiples of:
  // tagName
  // .className
  // #idName
  // [attribute="value"]
  // separated by spaces
  function finder(selector, context) {
    
    if (!_.isString(selector)) {
      throw new Error('Only string types can be passed as selectors');
    }

    var resultSet = {};
    var children  = childEls(context);
    var selectors = _.compact(selector.trim().split(' '));
    
    _.each(selectors, function (sel) {
      var type = sel.charAt(0);
        
        // ID Selector
        if (type === '#') {
          var el = _.find(children, function(ui) {
            return _.has(ui, '_$id') && ui._$id === selector.slice(1);
          });
          if (el && ! _.has(resultSet, el._$tid)) {
            resultSet[el._$tid] = el;
          }

        // Class Selector
        } else if (type === '.') {
          
          _.each(children, function(ui) {
            if (_.has(ui, '_$tid') &&
                classRegex(ui._$className).test(sel.slice(1))) {
                if (! _.has(resultSet, ui._$tid)) resultSet[ui._$tid] = ui;
              }
          });

        // Attribute Selector
        } else if (type === '[') {
         
          var pieces = selector.replace(/[\[\]]/g, '').split('=');
         
          if (pieces.length === 1) {
            _.each(children, function(ui) {
              if (_.has(ui, '_$tid') && _.has(ui, pieces[0])) {
                if (!_.has(resultSet, ui._$tid)) {
                  resultSet[ui._$tid] = ui;
                }
              }
            });
          
          } else {
          
            _.each(_.where(children, _.object(pieces)), function (ui) {
              if (_.has(ui, '_$tid') && !_.has(resultSet, ui._$tid)) {
                resultSet[ui._$tid] = ui;
              }
            });
          
          }
          
        // TagName Selector
        } else {

          _.each(children, function (ui) {
            if (_.has(ui, '_$tagName') && ui._$tagName === selector) {
              if (!_.has(resultSet, ui._$tid)) {
                resultSet[ui.$tid] = ui;
              }
            }
          });

        }
    });

    return _.values(resultSet);
  }

  function setAttr(el, key, value) {
    if (value instanceof $) {
      value = value.el();
      value._$parent = el;
    }
    el['set'+ucFirst(key)](value);
  }

  function ucFirst(str) {
    str = str == null ? '' : String(str);
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  var Mixins = {
    
    TabGroup: {
      
      hide: function () {
        this.context.hide();
        return this;
      },
      
      open: function () {
        this.context.open();
        return this;
      }
    },

    Tab: {
      
      open: function (el, opts) {
        el = _val(el);
        el._$containingTab = this.context;
        this.context.open(el, (opts || {}));
        return this;
      }

    },

    Window : {
      
      open: function (el, opts, callback) {
        if (!this.context._$containingTab) {
          console.log('Error: no containing tab');
          return false;
        }
        this.context._$containingTab.open(el, (opts || {}));
        el._$containingTab = this.context._$containingTab;
        if (callback) callback();
        return this;
      },
      
      close: function () {
        this.empty();
        this.context.close();
      }
    
    },

    TableView: {
      
      setData: function (data, nonSection) {
        var tmp = this.context.getData();
        this.context.setData([]);
        this.context.setData(data);
        for (var i=0, l=tmp.length; i < l; i++) {
          if (!tmp[i]._$tagName) tmp[i]._$tagName = 'TableViewSection';
        }
        $$(tmp).empty();
        return this;
      }

      // TODO: Good way to reference child rows

    }

  };

  function elementMixins(tdollar) {
    if (tdollar.context) {
      var m = Mixins[tdollar.context._$tagName];
      if (m) _.extend(tdollar, m);
    }
    return tdollar;
  }

  function  _val(el) {
    return (el instanceof $ ? el.context : el);
  }

  _.extend($, {
    make: makeUI
  });

  return $;

});