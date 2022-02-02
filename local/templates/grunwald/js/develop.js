(function ($) {
    'use strict';

    function DepotGrid(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotGrid.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotGrid',

        defaults: {
            columns: 12,
            gridSelector: '.js-grid',
            template: '<div class="grid ${gridSelector|substr(1)}"><div class="grid__container"><div class="grid__row">#{for column in 1..${columns}}<div class="grid__column"></div>#{endfor}</div></div></div>',
            addClass: 'has-layout',
        },

        getInitialState: function () {
            var self = this;
            var enabled = false;

            if (self.hasPlugin('depotStorage')) {
                enabled = $.depotStorage.getItem('grid') || false;
            }

            return {
                enabled: enabled
            };
        },

        render: function () {
            var self = this;

            if (self.state.enabled) {
                var gridContext = self.cleanObject(self.params);
                var gridHTML = self.format(self.params.template, gridContext);
                self.$HTML.addClass(self.params.addClass);
                self.$BODY.append(gridHTML);

                self.getElements();
            } else {
                if (self.$grid && self.$grid.length) {
                    self.$HTML.removeClass(self.params.addClass);
                    self.$grid.detach();
                    self.$grid = null;
                }
            }

            return self;
        },

        toggle: function () {
            var self = this;

            self.state.enabled = !self.state.enabled;
            $.depotStorage.setItem('grid', self.state.enabled);
            self.render();

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.$WINDOW.on('keyup', function (e) {
                if (e.which === 76 && e.ctrlKey) {
                    self.toggle();
                }
            });

            return self;
        },

        init: function () {
            var self = this;

            if (self.hasPlugin('depotStorage')) {
                var style = 'border:1px solid;border-radius:.3em;padding:.1em.2em';
                self.info('Используйте сочетание %cCtrl%c + %cl%c для включения / отключения сетки', style, '', style, '');
                self.render();
            } else {
                self.unbindEvents();
            }

            return self;
        }
    });

    $.depotGrid = function (settings) {
        return new DepotGrid($.depotProto.$BODY, settings);
    };
}(jQuery));

(function ($) {
    'use strict';
    $(function () {

//===========================
// Сетка
//===========================
        $.depotGrid({
            columns: 14
        });

    }); // dom ready
}(jQuery));
$(document).ready(function(){
    $("#yak-js__1").on("click","a", function (event) {
        event.preventDefault();
        var id  = $(this).attr('href'),
            top = $(id).offset().top;
        $('body,html').animate({scrollTop: top}, 1500);
    });
    $("#yak-js__2").on("click","a", function (event) {
        event.preventDefault();
        var id  = $(this).attr('href'),
            top = $(id).offset().top;
        $('body,html').animate({scrollTop: top}, 1500);
    });
});
//# sourceMappingURL=develop.js.map