var GitError = require('../util/errors').GitError;
var _ = require('underscore');
var Q = require('q');
// horrible hack to get localStorage Backbone plugin
var Backbone = (!require('../util').isBrowser()) ? require('backbone') : window.Backbone;

var Main = require('../app');
var Constants = require('../util/constants');
var KeyboardListener = require('../util/keyboard').KeyboardListener;

var BaseView = Backbone.View.extend({
  getDestination: function() {
    return this.destination || this.container.getInsideElement();
  },

  tearDown: function() {
    this.$el.remove();
    if (this.container) {
      this.container.tearDown();
    }
  },

  render: function(HTML) {
    // flexibility
    var destination = this.getDestination();
    HTML = HTML || this.template(this.JSON);

    this.$el.html(HTML);
    $(destination).append(this.el);
  }
});

var ResolveRejectBase = BaseView.extend({
  resolve: function() {
    this.deferred.resolve();
  },

  reject: function() {
    this.deferred.reject();
  }
});

var PositiveNegativeBase = BaseView.extend({
  positive: function() {
    this.navEvents.trigger('positive');
  },

  negative: function() {
    this.navEvents.trigger('negative');
  }
});

var ContainedBase = BaseView.extend({
  getAnimationTime: function() { return 700; },

  show: function() {
    this.container.show();
  },

  hide: function() {
    this.container.hide();
  },

  die: function() {
    this.hide();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this), this.getAnimationTime() * 1.1);
  }
});

var ConfirmCancelView = ResolveRejectBase.extend({
  tagName: 'div',
  className: 'confirmCancelView box horizontal justify',
  template: _.template($('#confirm-cancel-template').html()),
  events: {
    'click .confirmButton': 'resolve',
    'click .cancelButton': 'reject'
  },

  initialize: function(options) {
    if (!options.destination || !options.deferred) {
      throw new Error('needmore');
    }

    this.destination = options.destination;
    this.deferred = options.deferred;
    this.JSON = {
      confirm: options.confirm || 'Confirm',
      cancel: options.cancel || 'Cancel'
    };

    this.render();
  }
});

var LeftRightView = PositiveNegativeBase.extend({
  tagName: 'div',
  className: 'leftRightView box horizontal center',
  template: _.template($('#left-right-template').html()),
  events: {
    'click .left': 'negative',
    'click .right': 'positive'
  },

  initialize: function(options) {
    if (!options.destination || !options.events) {
      throw new Error('needmore');
    }

    this.destination = options.destination;
    this.navEvents = options.events;
    this.JSON = {
      showLeft: (options.showLeft === undefined) ? true : options.showLeft,
      lastNav: (options.lastNav === undefined) ? false : options.lastNav
    };

    this.render();
  }
});

var ModalView = Backbone.View.extend({
  tagName: 'div',
  className: 'modalView box horizontal center transitionOpacityLinear',
  template: _.template($('#modal-view-template').html()),

  getAnimationTime: function() { return 700; },

  initialize: function(options) {
    this.shown = false;
    this.render();
  },

  render: function() {
    // add ourselves to the DOM
    this.$el.html(this.template({}));
    $('body').append(this.el);
    // this doesnt necessarily show us though...
  },

  stealKeyboard: function() {
    Main.getEventBaton().stealBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().stealBaton('keyup', this.onKeyUp, this);
    Main.getEventBaton().stealBaton('windowFocus', this.onWindowFocus, this);
    Main.getEventBaton().stealBaton('documentClick', this.onDocumentClick, this);

    // blur the text input field so keydown events will not be caught by our
    // preventDefaulters, allowing people to still refresh and launch inspector (etc)
    $('#commandTextField').blur();
  },

  releaseKeyboard: function() {
    Main.getEventBaton().releaseBaton('keydown', this.onKeyDown, this);
    Main.getEventBaton().releaseBaton('keyup', this.onKeyUp, this);
    Main.getEventBaton().releaseBaton('windowFocus', this.onWindowFocus, this);
    Main.getEventBaton().releaseBaton('documentClick', this.onDocumentClick, this);

    Main.getEventBaton().trigger('windowFocus');
  },

  onWindowFocus: function(e) {
    //console.log('window focus doing nothing', e);
  },

  onDocumentClick: function(e) {
    //console.log('doc click doing nothing', e);
  },

  onKeyDown: function(e) {
    e.preventDefault();
  },

  onKeyUp: function(e) {
    e.preventDefault();
  },

  show: function() {
    this.toggleZ(true);
    // on reflow, change our class to animate. for whatever
    // reason if this is done immediately, chrome might combine
    // the two changes and lose the ability to animate and it looks bad.
    process.nextTick(_.bind(function() {
      this.toggleShow(true);
    }, this));
  },

  hide: function() {
    this.toggleShow(false);
    setTimeout(_.bind(function() {
      // if we are still hidden...
      if (!this.shown) {
        this.toggleZ(false);
      }
    }, this), this.getAnimationTime());
  },

  getInsideElement: function() {
    return this.$('.contentHolder');
  },

  toggleShow: function(value) {
    // this prevents releasing keyboard twice
    if (this.shown === value) { return; }

    if (value) {
      this.stealKeyboard();
    } else {
      this.releaseKeyboard();
    }

    this.shown = value;
    this.$el.toggleClass('show', value);
  },

  toggleZ: function(value) {
    this.$el.toggleClass('inFront', value);
  },

  tearDown: function() {
    this.$el.html('');
    $('body')[0].removeChild(this.el);
  }
});

var ModalTerminal = ContainedBase.extend({
  tagName: 'div',
  className: 'box flex1',
  template: _.template($('#terminal-window-template').html()),

  initialize: function(options) {
    options = options || {};

    this.container = new ModalView();
    this.JSON = {
      title: options.title || 'Heed This Warning!'
    };

    this.render();
  },

  getInsideElement: function() {
    return this.$('.inside');
  }
});

var ModalAlert = ContainedBase.extend({
  tagName: 'div',
  template: _.template($('#modal-alert-template').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      title: options.title || 'Something to say',
      text: options.text || 'Here is a paragraph',
      markdown: options.markdown
    };

    if (options.markdowns) {
      this.JSON.markdown = options.markdowns.join('\n');
    }

    this.container = new ModalTerminal({
      title: 'Alert!'
    });
    this.render();

    if (!options.wait) {
      this.show();
    }
  },

  render: function() {
    var HTML = (this.JSON.markdown) ?
      require('markdown').markdown.toHTML(this.JSON.markdown) :
      this.template(this.JSON);

    // call to super, not super elegant but better than
    // copy paste code
    ModalAlert.__super__.render.apply(this, [HTML]);
  }
});

var ConfirmCancelTerminal = Backbone.View.extend({
  initialize: function(options) {
    options = options || {};


    this.deferred = options.deferred || Q.defer();
    this.modalAlert = new ModalAlert(_.extend(
      {},
      { markdown: '#you sure?' },
      options.modalAlert
    ));


    var buttonDefer = Q.defer();
    this.buttonDefer = buttonDefer;
    this.confirmCancel = new ConfirmCancelView({
      deferred: buttonDefer,
      destination: this.modalAlert.getDestination()
    });

    // whenever they hit a button. make sure
    // we close and pass that to our deferred
    buttonDefer.promise
    .then(_.bind(function() {
      this.deferred.resolve();
    }, this))
    .fail(_.bind(function() {
      this.deferred.reject();
    }, this))
    .done(_.bind(function() {
      this.close();
    }, this));

    // also setup keyboard
    this.navEvents = _.clone(Backbone.Events);
    this.navEvents.on('positive', this.positive, this);
    this.navEvents.on('negative', this.negative, this);
    this.keyboardListener = new KeyboardListener({
      events: this.navEvents,
      aliasMap: {
        enter: 'positive',
        esc: 'negative'
      }
    });

    if (!options.wait) {
      this.modalAlert.show();
    }
  },

  positive: function() {
    this.buttonDefer.resolve();
  },

  negative: function() {
    this.buttonDefer.reject();
  },

  getAnimationTime: function() { return 700; },

  show: function() {
    this.modalAlert.show();
  },

  hide: function() {
    this.modalAlert.hide();
  },

  getPromise: function() {
    return this.deferred.promise;
  },

  close: function() {
    this.keyboardListener.mute();
    this.modalAlert.die();
  }
});

var NextLevelConfirm = ConfirmCancelTerminal.extend({
  initialize: function(options) {
    options = options || {};
    this.nextLevelName = options.nextLevelName || 'The mysterious next level';

    var markdowns = [
      '## Great Job!!',
      '',
      'You solved the level in **' + options.numCommands + '** command(s); ',
      'our solution uses ' + options.best + '. '
    ];

    if (options.numCommands <= options.best) {
      markdowns.push(
        'Awesome! You matched or exceeded our solution. '
      );
    } else {
      markdowns.push(
        'See if you can whittle it down to ' + options.best + ' command(s) :D '
      );
    }

    markdowns = markdowns.concat([
      '',
      'Would you like to move onto "',
      this.nextLevelName + '", the next level?'
    ]);

    options.modalAlert = {
      markdowns: markdowns
    };

    NextLevelConfirm.__super__.initialize.apply(this, [options]);
  }
});

var ZoomAlertWindow = Backbone.View.extend({
  initialize: function(options) {
    this.grabBatons();
    this.modalAlert = new ModalAlert({
      markdowns: [
        '## That zoom level is not supported :-/',
        'Please zoom back to a supported zoom level with Ctrl + and Ctrl -',
        '',
        '(and of course, pull requests to fix this are appreciated :D)'
      ]
    });

    this.modalAlert.show();
  },

  grabBatons: function() {
    Main.getEventBaton().stealBaton('zoomChange', this.zoomChange, this);
  },

  releaseBatons: function() {
    Main.getEventBaton().releaseBaton('zoomChange', this.zoomChange, this);
  },

  zoomChange: function(level) {
    if (level <= Constants.VIEWPORT.maxZoom &&
        level >= Constants.VIEWPORT.minZoom) {
      this.finish();
    }
  },

  finish: function() {
    this.releaseBatons();
    this.modalAlert.die();
  }
});

var LevelToolbar = BaseView.extend({
  tagName: 'div',
  className: 'levelToolbarHolder',
  template: _.template($('#level-toolbar-template').html()),

  initialize: function(options) {
    options = options || {};
    this.JSON = {
      name: options.name || 'Some level! (unknown name)'
    };

    this.beforeDestination = $($('#commandLineHistory div.toolbar')[0]);
    this.render();

    if (!options.wait) {
      process.nextTick(_.bind(this.show, this));
    }
  },

  getAnimationTime: function() { return 700; },

  render: function() {
    var HTML = this.template(this.JSON);

    this.$el.html(HTML);
    this.beforeDestination.after(this.el);
  },

  die: function() {
    this.hide();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this), this.getAnimationTime());
  },

  hide: function() {
    this.$('div.toolbar').toggleClass('hidden', true);
  },

  show: function() {
    this.$('div.toolbar').toggleClass('hidden', false);
  }
});

var CanvasTerminalHolder = BaseView.extend({
  tagName: 'div',
  className: 'canvasTerminalHolder box flex1',
  template: _.template($('#terminal-window-bare-template').html()),
  events: {
    'click div.wrapper': 'onClick'
  },

  initialize: function(options) {
    options = options || {};
    this.destination = $('body');
    this.JSON = {
      title: options.title || 'Goal To Reach',
      text: options.text || 'You can hide this window with "hide goal"'
    };

    this.render();
  },

  getAnimationTime: function() { return 700; },

  onClick: function() {
    this.slideOut();
  },

  die: function() {
    this.slideOut();
    setTimeout(_.bind(function() {
      this.tearDown();
    }, this));
  },

  slideOut: function() {
    this.slideToggle(true);
  },

  slideIn: function() {
    this.slideToggle(false);
  },

  slideToggle: function(value) {
    this.$('div.terminal-window-holder').toggleClass('slideOut', value);
  },

  getCanvasLocation: function() {
    return this.$('div.inside')[0];
  }
});

exports.BaseView = BaseView;
exports.ModalView = ModalView;
exports.ModalTerminal = ModalTerminal;
exports.ModalAlert = ModalAlert;
exports.ContainedBase = ContainedBase;
exports.ConfirmCancelView = ConfirmCancelView;
exports.LeftRightView = LeftRightView;
exports.ZoomAlertWindow = ZoomAlertWindow;
exports.ConfirmCancelTerminal = ConfirmCancelTerminal;

exports.CanvasTerminalHolder = CanvasTerminalHolder;
exports.LevelToolbar = LevelToolbar;
exports.NextLevelConfirm = NextLevelConfirm;

