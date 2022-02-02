/**
 * @name depotProto
 * @version 5.1.0
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotProto.git
 * @license MIT
 * @changes:
 * (add) добавил ограничение в пол года на отправку сообщений об ошибках
 * (add) добавил в шаблонизатор тег _{path|fallbackPath?} для вывода строк словаря (аналог self.getText(path, fallbackPath?))
 * (add) добавил третий необязательный аргумент в метод self.getText(path, fallbackPath?, dictionary?)) - `dictionary` - словарь по которому производится поиск
 * (add) добавил фильтр `escapeHTML` для фильтрации HTML
 * (add) добавил возможность прокидывать свой фильтр через контекст `filters: {filterName: filter}`
 * (rename) переименовал внутреннею переменную `waitingDelaysCount` на `waitingDelaysQuantity`
 * (rename) переименовал внутренний метод `initExtensions` на `applyMixins`
 */

(function ($) {
    'use strict';
    var DELAYS = Object.create(null);
    var SCRIPTS = [];

    function now() {
        return performance && performance.now && performance.now() || Date.now && Date.now() || new Date().getTime();
    }

    function getType(target) {
        return Object.prototype.toString.call(target).slice(8, -1).toLowerCase();
    }

    function liteMD(args) {
        var tags = {
            '`': {
                set: 'border:1px solid;border-radius:.3em;padding:.1em.2em',
                reset: ''
            },
            '*': {
                set: 'font-weight:bolder',
                reset: ''
            },
            '_': {
                set: 'font-style:italic',
                reset: ''
            }
        };

        var result = [];
        var lastIndex = 0;
        var string = args.shift();
        var tagsRe = /([`*_])((?:(?!\1)[^`*_])+)\1(?![`*_A-zА-яЁё])/g;
        var argsRe = /%([Oosc]|(?:[0-9.]+)?[dif])/g;

        result.unshift(string.replace(tagsRe, function (sub, tagKey, text, index) {
            var tag = tags[tagKey];
            var subString = string.substring(lastIndex, index);
            var argsBefore = subString.match(argsRe);
            var argsBeforeLength = argsBefore ? argsBefore.length : 0;
            var argsInside = text.match(argsRe);
            var argsInsideLength = argsInside ? argsInside.length : 0;
            lastIndex = index;

            if (argsBeforeLength > 0) {
                for (var i = 0; i < argsBeforeLength; i += 1) {
                    result.push(args.shift());
                }
            }

            result.push(tag.set);

            if (argsInsideLength > 0) {
                for (var j = 0; j < argsInsideLength; j += 1) {
                    result.push(args.shift());
                }
            }

            result.push(tag.reset);

            return '%c' + text + '%c';
        }));

        return result.concat(args);
    }

    function deepTranslate(obj, language) {
        if (obj && getType(obj) === 'object' || getType(obj) === 'array') {
            var result = obj[language];

            if (result) {
                obj = result;
            } else if (!result && getType(obj) === 'object' || getType(obj) === 'array') {
                $.each(obj, function (key, value) {
                    if (value && getType(value) === 'object' || getType(value) === 'array') {
                        var deepResult = value[language];

                        if (deepResult) {
                            obj[key] = deepResult;
                        } else {
                            obj[key] = deepTranslate(value, language);
                        }
                    }
                });
            }
        }

        return obj;
    }

    function stripPasswords(data) {
        return JSON.parse(JSON.stringify(data)
            .replace(/"(pass[^"]*)":"([^"]*)"/ig, '"$1":"***"')
            .replace(/(pass[^/=]*)=([^&]*)/ig, '$1=***')
        );
    }

    function collectTelemetry(self) {
        var telemetry = Object.create(null);
        telemetry.build = self && self.BUILD;
        telemetry.timestamp = now();

        if (navigator) {
            telemetry.platform = navigator.platform;
            telemetry.userAgent = navigator.userAgent;
            telemetry.cookieEnabled = navigator.cookieEnabled;

            if (navigator.connection) {
                telemetry.connectionSaveData = navigator.connection.saveData;
                telemetry.connectionDownlink = navigator.connection.downlink;
                telemetry.connectionEffectiveType = navigator.connection.effectiveType;
            }

            if (navigator.plugins) {
                telemetry.plugins = [];
                $.each(navigator.plugins, function (i, plugin) {
                    telemetry.plugins.push(plugin.name);
                });
            }
        }

        if (screen) {
            telemetry.screenWidth = screen.width;
            telemetry.screenHeight = screen.height;
        }

        return telemetry;
    }

    function arrayFromRange(range) {
        var array = [];
        var matches = range && range.match(/^([0-9-]+)\.\.([0-9-]+)$/);

        if (matches) {
            var start = parseInt(matches[1], 10);
            var end = parseInt(matches[2], 10);
            if (start <= end) {
                for (var i = start; i <= end; i += 1) {
                    array.push(i);
                }
            } else if (start > end) {
                for (var j = start; j >= end; j -= 1) {
                    array.push(j);
                }
            }
        }

        return array;
    }

    var depotProto = {
        pluginName: 'depotProto',

        DEBUG: !!window.location.host.match(/(127\.0\.0\.1|localhost|\.local|\.designdepot\.ru)/i),
        MARKUP: !!window.location.pathname.match(/\.html/i),
        BUILD: '2021-10-15T10:08:06',

        $WINDOW: $(window),
        $DOCUMENT: $(document),
        $HTML: $(document.documentElement),
        $BODY: $(document.body),
        $HTMLBODY: $([document.documentElement, document.body]),

        KEYS: {
            ARROW_DOWN: 40,
            ARROW_LEFT: 37,
            ARROW_RIGHT: 39,
            ARROW_UP: 38,
            ENTER: 13,
            ESCAPE: 27,
            SPACE: 32,
            TAB: 9
        },

        LANGUAGE: document.documentElement.lang || 'ru',

        defaults: {
            processingClassName: 'is-processing',
            selectedClassName: 'is-selected',
            visibleClassName: 'is-visible',
            activeClassName: 'is-active',
            getElementsOutside: false,
            dictionary: {
                month: {
                    0: {
                        full: {ru: 'Январь', en: 'January'},
                        plural: {ru: 'Января', en: 'January'},
                        short: {ru: 'Янв', en: 'Jan'}
                    },
                    1: {
                        full: {ru: 'Февраль', en: 'February'},
                        plural: {ru: 'Февраля', en: 'February'},
                        short: {ru: 'Фев', en: 'Feb'}
                    },
                    2: {
                        full: {ru: 'Март', en: 'March'},
                        plural: {ru: 'Марта', en: 'March'},
                        short: {ru: 'Мар', en: 'Mar'}
                    },
                    3: {
                        full: {ru: 'Апрель', en: 'April'},
                        plural: {ru: 'Апреля', en: 'April'},
                        short: {ru: 'Апр', en: 'Apr'}
                    },
                    4: {
                        full: {ru: 'Май', en: 'May'},
                        plural: {ru: 'Мая', en: 'May'},
                        short: {ru: 'Май', en: 'May'}
                    },
                    5: {
                        full: {ru: 'Июнь', en: 'June'},
                        plural: {ru: 'Июня', en: 'June'},
                        short: {ru: 'Июн', en: 'June'}
                    },
                    6: {
                        full: {ru: 'Июль', en: 'July'},
                        plural: {ru: 'Июля', en: 'July'},
                        short: {ru: 'Июл', en: 'July'}
                    },
                    7: {
                        full: {ru: 'Август', en: 'August'},
                        plural: {ru: 'Августа', en: 'August'},
                        short: {ru: 'Авг', en: 'Aug'}
                    },
                    8: {
                        full: {ru: 'Сентябрь', en: 'September'},
                        plural: {ru: 'Сентября', en: 'September'},
                        short: {ru: 'Сен', en: 'Sept'}
                    },
                    9: {
                        full: {ru: 'Октябрь', en: 'October'},
                        plural: {ru: 'Октября', en: 'October'},
                        short: {ru: 'Окт', en: 'Oct'}
                    },
                    10: {
                        full: {ru: 'Ноябрь', en: 'November'},
                        plural: {ru: 'Ноября', en: 'November'},
                        short: {ru: 'Ноя', en: 'Nov'}
                    },
                    11: {
                        full: {ru: 'Декабрь', en: 'December'},
                        plural: {ru: 'Декабря', en: 'December'},
                        short: {ru: 'Дек', en: 'Dec'}
                    }
                },
                weekday: {
                    0: {
                        full: {ru: 'Воскресенье', en: 'Sunday'},
                        short: {ru: 'Вс', en: 'Su'}
                    },
                    1: {
                        full: {ru: 'Понедельник', en: 'Monday'},
                        short: {ru: 'Пн', en: 'Mo'}
                    },
                    2: {
                        full: {ru: 'Вторник', en: 'Tuesday'},
                        short: {ru: 'Вт', en: 'Tu'}
                    },
                    3: {
                        full: {ru: 'Среда', en: 'Wednesday'},
                        short: {ru: 'Ср', en: 'We'}
                    },
                    4: {
                        full: {ru: 'Четверг', en: 'Thursday'},
                        short: {ru: 'Чт', en: 'Th'}
                    },
                    5: {
                        full: {ru: 'Пятница', en: 'Friday'},
                        short: {ru: 'Пт', en: 'Fr'}
                    },
                    6: {
                        full: {ru: 'Суббота', en: 'Saturday'},
                        short: {ru: 'Сб', en: 'Sa'}
                    }
                }
            },
            debounce: 300,
            extend: null,
            mixins: [],
            beforeInit: null,
            onInit: null
        },

        clamp: function (min, val, max) {
            return Math.max(min, Math.min(val, max));
        },

        getNameSpace: function () {
            return this.format('.${pluginName}-${hash}', this);
        },

        cleanObject: function (props) {
            var self = this;

            var clean = Object.create(null);
            if (props && getType(props) === 'object') {
                clean = $.extend(clean, props);
            } else {
                try {
                    $.each(props, function (key, value) {
                        clean[key] = value;
                    });
                } catch (error) {
                    self.error(error);
                }
            }

            return clean;
        },

        getInitialState: function () {
            return this.cleanObject();
        },

        getType: getType,

        now: now,

        prefersReducedMotion: function () {
            var prefers = false;

            if (window.matchMedia) {
                prefers = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            }

            return prefers;
        },

        error: function (source, force) {
            var self = this;
            var error = Object.create({
                message: undefined,
                name: undefined,
                description: undefined,
                number: undefined,
                filename: undefined,
                lineNumber: undefined,
                columnNumber: undefined,
                stack: undefined,
            });
            var sourceType = getType(source);
            if (sourceType === 'error') {
                $.each(error, function (key) {
                    if (source[key] !== undefined) {
                        error[key] = source[key];
                    }
                });
            } else if (sourceType === 'object') {
                error = $.extend(error, source);
            } else if (sourceType === 'string') {
                error.message = source;
                error.name = 'Error';
            }

            var errorData = {
                error: stripPasswords(error),
                telemetry: collectTelemetry(self)
            };

            if (self.DEBUG === false || force) {
                if (new Date(self.BUILD).getTime() + 15768000000 > Date.now()) {
                    $.ajax({
                        url: 'https://logs.designdepot.ru/js/',
                        type: 'POST',
                        data: {
                            error: JSON.stringify(errorData)
                        },
                        global: false,
                        error: function () {
                            self.warn('Автоматическая отправка отчета об ошибке провалилась.\n'
                                + 'Вы можете связаться с нами по е-mail: webmaster@designdepot.ru');
                        }
                    });
                }
            }
            var message = self.format('#{if name}${name}: #{endif}#{if number}${number} - #{endif}${message}', error);
            var _defaults = ['%c♦ %c%s:%c ' + message, 'color:#' + self.hash, 'color:tomato', self.pluginName, ''];

            Function.prototype.apply.call(
                console.error,
                console,
                liteMD(_defaults.concat(errorData))
            );

            return error;
        },

        warn: function () {
            var self = this;
            var pluginName = self.pluginName;
            var _arguments = Array.prototype.slice.call(arguments);
            if (!_arguments.length) {
                return;
            }
            var _text = _arguments.shift();
            var _defaults;

            if (typeof _text === 'string' && _text.indexOf('--debug') === 0) {
                if (!self.DEBUG) {
                    return undefined;
                }
                _text = _arguments.shift();
            }

            if (typeof _text === 'string' && _text.indexOf('::') === 0) {
                pluginName += _text;
                _text = _arguments.shift();
            }

            if (typeof _text === 'string') {
                _defaults = ['%c♦ %c%s:%c ' + _text, 'color:#' + self.hash, 'color:orange', pluginName, ''];
            } else {
                _defaults = ['%c♦ %c%s:%c', 'color:#' + self.hash, 'color:orange', pluginName, '', _text];
            }

            return Function.prototype.apply.call(
                console.warn,
                console,
                liteMD(_defaults.concat(_arguments))
            );
        },

        info: function () {
            var self = this;
            var pluginName = self.pluginName;
            var _arguments = Array.prototype.slice.call(arguments);
            if (!_arguments.length) {
                return;
            }
            var _text = _arguments.shift();
            var _defaults;

            if (typeof _text === 'string' && _text.indexOf('--debug') === 0) {
                if (!self.DEBUG) {
                    return undefined;
                }
                _text = _arguments.shift();
            }

            if (typeof _text === 'string' && _text.indexOf('::') === 0) {
                pluginName += _text;
                _text = _arguments.shift();
            }

            if (typeof _text === 'string') {
                _defaults = ['%c♦ %c%s:%c ' + _text, 'color:#' + self.hash, 'color:cyan', pluginName, ''];
            } else {
                _defaults = ['%c♦ %c%s:%c', 'color:#' + self.hash, 'color:cyan', pluginName, '', _text];
            }

            return Function.prototype.apply.call(
                console.info,
                console,
                liteMD(_defaults.concat(_arguments))
            );
        },

        log: function () {
            var self = this;
            var _arguments = Array.prototype.slice.call(arguments);
            var pluginName = self.pluginName;
            if (!_arguments.length) {
                return;
            }
            var _text = _arguments.shift();
            var _defaults;

            if (typeof _text === 'string' && _text.indexOf('--debug') === 0) {
                if (!self.DEBUG) {
                    return false;
                }
                _text = _arguments.shift();
            }

            if (typeof _text === 'string' && _text.indexOf('::') === 0) {
                pluginName += _text;
                _text = _arguments.shift();
            }

            if (typeof _text === 'string') {
                _defaults = ['%c♦ %c%s:%c ' + _text, 'color:#' + self.hash, 'color:dodgerblue;', pluginName, ''];
            } else {
                _defaults = ['%c♦ %c%s:%c', 'color:#' + self.hash, 'color:dodgerblue;', pluginName, '', _text];
            }

            return Function.prototype.apply.call(
                console.log,
                console,
                liteMD(_defaults.concat(_arguments))
            );
        },

        hashify: function (value, length) {
            var int = value;
            var magic = 2378757;
            if (typeof value === 'object' || typeof value === 'string' && !value.length) {
                value = JSON.stringify(value);
            }
            if (typeof value === 'function') {
                value = value.toString();
            }
            length = length ? length > 12 ? 12 : length : 6;
            if (typeof value === 'string') {
                int = 0;
                value.split('').forEach(function (currentValue, index) {
                    var charCode = currentValue.charCodeAt(0);
                    int += (charCode + index) / (magic + charCode);
                });
            } else if (typeof value === 'undefined' || typeof value === 'undefined') {
                int = Math.random();
            }
            return ((Math.abs(int) + 1) / (magic + int)).toString(16).substr(length * -1);
        },

        format: function (template, context) {
            var self = this;

            function getValue(valueToken, context) {
                var filters = {
                    hash: self.hashify,
                    plural: function filterPlural(quantity, one, two, many) {
                        var result;
                        var quantityString = quantity.toString();

                        if (quantityString.match(/([^1]|^)(1)$/)) {
                            result = one;
                        } else if (quantityString.match(/([^1]|^)([234])$/)) {
                            result = two === undefined ? '' : two;
                        } else {
                            result = many === undefined ? two === undefined ? '' : two : many;
                        }

                        return result;
                    },
                    digit: function filterDigit(number, fractionDigits) {
                        var stringNumber = fractionDigits === undefined ? number.toString() : number.toFixed(fractionDigits);
                        var partsNumber = stringNumber.split('.');
                        var ceilNumber = partsNumber[0];
                        var decNumber = partsNumber[1];

                        return number !== undefined ? ceilNumber
                            .split('')
                            .reverse()
                            .join('')
                            .split(/([0-9]{3})/)
                            .join(' ')
                            .split('').reverse()
                            .join('').trim() + (decNumber ? ',' + decNumber : '') : number;
                    },
                    ft: function filterFt(string) {
                        var defined = string !== undefined;
                        return defined ? string.toString().replace(/^[—]\s/ig, '&mdash;&nbsp;')
                            .replace(/\s[—]\s/ig, '&nbsp;&mdash;&thinsp;')
                            .replace(/[—]/ig, '&mdash;')
                            .replace(/([0-9])[x]+([0-9])/ig, '$1&times;$2')
                            .replace(/(?=[>])"([^"<>]+)"/ig, '&laquo;$1&raquo;')
                            .replace(/(^|\s|[^a-zа-яё0-9_-])([0-9]+|[a-zа-яё]{1,3})\s/ig, '$1$2&nbsp;') : string;
                    },
                    fixed: function filterFixed(number, digits, min) {
                        var fixed = number;

                        if (!isNaN(number)) {
                            fixed = parseFloat(number).toFixed(digits || 1);

                            if (min) {
                                fixed = parseFloat(fixed);
                            }
                        }

                        return fixed;
                    },
                    round: function filterRound(number) {
                        var notNaN = !isNaN(number);
                        return notNaN ? Math.round(number) : number;
                    },
                    zero: function filterZero(number) {
                        var parts = number.toString().split('.');
                        var intNumber = parseInt(parts[0], 10);
                        var floatNumber = parts[1] ? '.' + parts[1] : '';
                        var notNaN = !isNaN(number);
                        var notBig = intNumber < 10;
                        return notNaN && notBig ? ('0' + intNumber).substr(-2) + floatNumber : number;
                    },
                    join: function filterJoin(value, separator) {
                        var result = value;

                        if (getType(value) === 'array') {
                            result = value.join(separator);
                        }

                        return result;
                    },
                    extra: function filterExtra(value) {
                        var result = [];

                        if (getType(value) === 'object') {
                            $.each(value, function (paramName, paramValue) {
                                result.push(paramName + '="' + paramValue + '"');
                            });
                        }

                        return result.join(' ');
                    },
                    default: function filterDefault(value, defaultToken) {
                        var result = value;

                        if (!value) {
                            if (defaultToken) {
                                var defaultValue = getValue(defaultToken, context);

                                if (defaultValue) {
                                    result = defaultValue;
                                } else {
                                    try {
                                        result = JSON.parse(defaultToken);
                                    } catch (error) {
                                        result = defaultToken;
                                    }
                                }
                            } else {
                                result = '';
                            }
                        }

                        return result;
                    },
                    substr: function filterSubstr(value, from, length) {
                        var result = value;

                        if (getType(value) === 'string') {
                            result = value.substr(from, length);
                        }

                        return result;
                    },
                    length: function filterLength(value) {
                        var result;
                        var valueType = getType(value);

                        if (valueType === 'array') {
                            result = value.length;
                        } else if (valueType === 'object') {
                            result = Object.keys(value).length;
                        } else if (valueType === 'string' || valueType === 'number') {
                            result = value.toString().length;
                        }

                        return result;
                    },
                    lower: function filterLower(value) {
                        return value !== undefined ? value.toString().toLowerCase() : value;
                    },
                    upper: function filterUpper(value) {
                        return value !== undefined ? value.toString().toUpperCase() : value;
                    },
                    date: function filterDate(rawDate, format) {
                        var result = rawDate;
                        if (rawDate) {
                            var date = getType(rawDate) === 'date' ? rawDate : new Date(rawDate);
                            var formatTemplate = format ? format.replace(/([a-z])/ig, '\${$1}') : '${Y}-${m}-${d}';
                            // https://docs.djangoproject.com/en/dev/ref/templates/builtins/#std:templatefilter-date
                            var context = {
                                // День
                                d: function () {
                                    // - Day of the month, 2 digits with leading zeros. '01' to '31'
                                    return getValue('d|zero', {d: date.getDate()});
                                },
                                j: function () {
                                    // - Day of the month without leading zeros. '1' to '31'
                                    return date.getDate();
                                },
                                D: function () {
                                    // - Day of the week, textual, 3 letters. 'Fri'
                                    return self.getText('weekday.' + date.getDay() + '.short');
                                },
                                l: function () {
                                    // Day of the week, textual, long. 'Friday'
                                    return self.getText('weekday.' + date.getDay() + '.full');
                                },
                                w: function () {
                                    // - Day of the week, digits without leading zeros. '0' (Sunday) to '6' (Saturday)
                                    return date.getDay();
                                },
                                N: function () {
                                    // - Day of the week, digits without leading zeros.	'1' (Monday) to '7' (Sunday)
                                    var dateDay = date.getDay();
                                    return dateDay === 0 ? 7 : dateDay + 1;
                                },
                                // Месяц
                                m: function () {
                                    // - Month, 2 digits with leading zeros. '01' to '12'
                                    return getValue('m|zero', {m: date.getMonth() + 1});
                                },
                                n: function () {
                                    // - Month without leading zeros. '1' to '12'
                                    return date.getMonth() + 1;
                                },
                                M: function () {
                                    // - Month, textual, 3 letters. 'Jan'
                                    return self.getText('month.' + date.getMonth() + '.short');
                                },
                                E: function () {
                                    // - Month, locale specific alternative representation usually used for long date representation. 'listopada' (for Polish locale, as opposed to 'Listopad')
                                    return self.getText('month.' + date.getMonth() + '.plural');
                                },
                                F: function () {
                                    // - Month, textual, long. 'January'
                                    return self.getText('month.' + date.getMonth() + '.full');
                                },
                                // Год
                                y: function () {
                                    // - Year, 2 digits. '99'
                                    return date.getFullYear().toString().substr(-2);
                                },
                                Y: function () {
                                    // - Year, 4 digits. '1999'
                                    return date.getFullYear();
                                },
                                // Время
                                H: function () {
                                    // Hour, 24-hour format. '00' to '23'
                                    return getValue('H|zero', {H: date.getHours()});
                                },
                                i: function () {
                                    // Minutes. '00' to '59'
                                    return getValue('i|zero', {i: date.getMinutes()});
                                },
                                s: function () {
                                    // Seconds, 2 digits with leading zeros. '00' to '59'
                                    return getValue('s|zero', {s: date.getSeconds()});
                                }
                            };
                            result = self.format(formatTemplate, context);
                        }

                        return result;
                    },
                    json: function filterJson(value) {
                        var result;
                        try {
                            result = JSON.stringify(value);
                        } catch (error) {
                            result = value;
                        }
                        return result;
                    },
                    escapeHTML: function filterEscapeHTML(value) {
                        var escapes = {
                            '&': '&amp',
                            '<': '&lt',
                            '>': '&gt',
                            '"': '&quot',
                            '\'': '&#39'
                        };
                        var re = /[&<>"']/g;
                        return value !== undefined && re.test(value) ? value.replace(re, function (char) {
                            return escapes[char];
                        }) : value;
                    }
                };

                var currentContext = self.cleanObject(context);
                var valueParts = valueToken.toString().split('|');
                var valuePath = valueParts.shift();
                var filtersChain = valueParts;

                var value = currentContext[valuePath];

                if (valuePath.indexOf('.') !== -1) {
                    $.each(valuePath.split('.'), function (i, subValueName) {
                        currentContext = currentContext[subValueName.trim()];
                        return !!currentContext;
                    });
                    value = currentContext;
                }

                if (getType(value) === 'function') {
                    value = value.call(self);
                }

                if (value !== undefined && filtersChain.length) {
                    $.each(filtersChain, function (i, rawFilter) {
                        var filterMatch = rawFilter.match(/^([^(]+)(?:\(([^)]+)\))?$/, 'g');
                        if (filterMatch) {
                            var filterName = filterMatch[1];
                            var filterParams = filterMatch[2] ? filterMatch[2].split(/,[ ]*/) : [];
                            var filter = getType(filters[filterName]) === 'function' && filters[filterName];

                            if (!filter && getType(context.filters) === 'object' && getType(context.filters[filterName]) === 'function') {
                                filter = context.filters[filterName];
                            }

                            if (filter) {
                                value = filter.apply(null, Array.prototype.concat(value, filterParams));
                            } else {
                                self.warn('Шаблонный фильтр _%s_ не найден', filterName);
                            }
                        } else {
                            self.warn('Ошибка в написании фильтра _|%s_', rawFilter);
                        }
                    });
                }

                return value;
            }

            function loop(template, context) {
                var tagRegExp = /#{for\s+([^}!]+)}(((?:(?!#{(?:empty|endfor)}).)*)#{empty})?((?:(?!#{endfor}).)*(?:((?!#{for\s+[^}!]+}).)*))#{endfor}/gm;
                var result = template;

                function formatEach(template, items, itemName, context) {
                    var dataPropLength = getType(items) === 'array' ? items.length : Object.keys(items).length;
                    var eachResult = template;

                    if (dataPropLength) {
                        eachResult = '';
                        var loopIndex0 = 0;
                        $.each(items, function (_key, _item) {
                            var loopContext = $.extend(true, self.cleanObject(context), {
                                loop: {
                                    key: _key,
                                    isFirst: loopIndex0 === 0,
                                    isLast: loopIndex0 === dataPropLength - 1,
                                    index0: loopIndex0,
                                    index: loopIndex0 + 1,
                                    item: _item,
                                    isOnly: dataPropLength === 1
                                }
                            });

                            loopContext[itemName] = _item;
                            eachResult += self.format(template, loopContext);
                            loopIndex0 += 1;
                        });
                    }

                    return eachResult;
                }

                function replacer(templateTag, expression, emptyFlag, subTemplateYes, subTemplateNo) {
                    var items;
                    var replaceResult;
                    var expressionMatches = expression.match(/^(.*)\s+in\s+(.*)$/i);
                    var itemName = expressionMatches[1];
                    var itemsToken = expressionMatches[2];

                    if (itemsToken && itemsToken.indexOf('..') !== -1) {
                        items = arrayFromRange(itemsToken);
                    } else {
                        items = getValue(itemsToken, context);
                    }

                    if ((items !== undefined) && (getType(items) === 'array' || getType(items) === 'object')) {
                        var itemsQuantity = getType(items) === 'array' ? items.length : Object.keys(items).length;

                        if (itemsQuantity > 5000) {
                            self.warn('::format', 'Операция может занять много времени, вы не можете повлиять на это');
                        }

                        if (!emptyFlag && itemsQuantity) {
                            replaceResult = formatEach(subTemplateNo, items, itemName, context);
                        } else if (emptyFlag && itemsQuantity) {
                            replaceResult = formatEach(subTemplateYes, items, itemName, context);
                        } else if (emptyFlag && !itemsQuantity) {
                            replaceResult = formatEach(subTemplateNo, items, itemName, context);
                        }
                    }

                    return replaceResult === undefined ? templateTag : replaceResult;
                }

                if (context) {
                    var lastResult = result;
                    var shouldRepeat = true;
                    while (result.match(tagRegExp) && shouldRepeat) {
                        result = result.replace(tagRegExp, replacer);
                        if (lastResult !== result) {
                            lastResult = result;
                            shouldRepeat = true;
                        } else {
                            shouldRepeat = false;
                        }
                    }
                }

                return result;
            }

            function logic(template, context) {
                var tagRegExp = /#{if\s+([!]*)([^}!]+)}((((?!#{endif}).)*)#{else})?(((?!#{endif}).)*(((?!#{if\s+[^}]+}).)*))#{endif}/gm;
                var result = template;

                function replacer(templateTag, notFlag, valueToken, elseFlag, subTemplateYes, noop, subTemplateNo) {
                    var replaceResult = '';
                    var paramValue = getValue(valueToken, context);

                    if (!elseFlag && ((!notFlag && paramValue) || (notFlag && !paramValue))) {// yes
                        replaceResult = self.format(subTemplateNo, context);
                    } else if (elseFlag && ((!notFlag && paramValue) || (notFlag && !paramValue))) { // yes in else
                        replaceResult = self.format(subTemplateYes, context);
                    } else if (elseFlag && ((!notFlag && !paramValue) || (notFlag && paramValue))) { // else
                        replaceResult = self.format(subTemplateNo, context);
                    }

                    return replaceResult === undefined ? templateTag : replaceResult;
                }

                if (context) {
                    var lastResult = result;
                    var shouldRepeat = true;
                    while (result.match(tagRegExp) && shouldRepeat) {
                        result = result.replace(tagRegExp, replacer);
                        if (lastResult !== result) {
                            lastResult = result;
                            shouldRepeat = true;
                        } else {
                            shouldRepeat = false;
                        }
                    }
                }

                return result;
            }

            function variables(template, context) {
                var tagRegExp = /\${([^|$}]+(?:(?:\|)[^$}]*?)?)}/g;

                var result = template;

                if (context) {
                    var lastResult = result;
                    var shouldRepeat = true;
                    while (getType(result) === 'string' && result.match(tagRegExp) && shouldRepeat) {
                        result = result.replace(tagRegExp, function (templateTag, valueToken) {
                            var replaceResult = getValue(valueToken, context);
                            return replaceResult === undefined ? templateTag : replaceResult;
                        });

                        if (lastResult !== result) {
                            lastResult = result;
                            shouldRepeat = true;
                        } else {
                            shouldRepeat = false;
                        }
                    }
                }
                return result;
            }

            function i18n(template, context) {
                var tagRegExp = /_{([^|_}]+(?:(?:\|)[^_}]*?)?)}/g;
                var result = template;

                if (context) {
                    result = result.replace(tagRegExp, function (templateTag, valueToken) {
                        var valueParts = valueToken.split('|');
                        var path = valueParts[0];
                        var fallbackPath = valueParts[1];
                        var replaceResult = self.getText(path, fallbackPath, context.dictionary);
                        return replaceResult === undefined ? templateTag : replaceResult;
                    });
                }
                return result;
            }

            if (!template) {
                self.error({
                    action: 'DepotProto.format',
                    data: {
                        template: template,
                        context: context
                    },
                    name: 'ArgumentError',
                    message: 'переменная _template_ не получена'
                });

                return;
            }

            var result = template;

            result = variables(result, context || {});
            result = loop(result, context || {});
            result = logic(result, context || {});
            result = i18n(result, context || {});

            return result;
        },

        translate: function (dictionary) {
            var self = this;

            if (!dictionary) {
                self.error({
                    action: 'DepotProto.translate',
                    data: {
                        dictionary: dictionary
                    },
                    name: 'ArgumentError',
                    message: 'переменная _dictionary_ не получена'
                });
                return;
            }

            return deepTranslate(dictionary, self.LANGUAGE);
        },

        getText: function (path, fallbackPath, dictionary) {
            var self = this;

            if (!path) {
                self.error({
                    action: 'DepotProto.getText',
                    data: {
                        path: path,
                        fallbackPath: fallbackPath,
                        dictionary: dictionary
                    },
                    name: 'ArgumentError',
                    message: 'переменная _path_ не получена'
                });
                return;
            }

            var result = '';
            var pathKeys = path.split('.');

            if (!dictionary) {
                dictionary = self.params.dictionary;
            }

            $.each(pathKeys, function (i, key) {
                if (!result) {
                    result = dictionary[key];
                } else {
                    result = result[key];
                    if (!result) {
                        if (fallbackPath) {
                            result = self.getText(fallbackPath, undefined, dictionary);
                        } else {
                            return false;
                        }
                    }
                }
            });

            return result;
        },

        addEventNS: function (eventType, additionalNS) {
            var self = this;
            var events;
            var results = [];

            switch (getType(eventType)) {
                case 'array':
                    events = eventType;
                    break;
                case 'object':
                    events = [];
                    $.each(eventType, function (key, value) {
                        events.push(value);
                    });
                    break;
                default:
                    events = eventType && eventType !== 'all' ? eventType.split(/[ ]+/) : [''];
                    break;
            }

            $.each(events, function () {
                results.push(this + (self.eventNameSpace || '') + (additionalNS || ''));
            });

            return results.join(' ');
        },

        throttle: function (eventId, callback, debounce) {
            var self = this;

            if (typeof eventId === 'function') {
                debounce = callback;
                callback = eventId;
                eventId = self.hashify(callback);
            }

            if (typeof callback === 'function') {
                if (self.cache === undefined) {
                    self.cache = Object.create(null);
                }
                if (self.cache.throttleTimers === undefined) {
                    self.cache.throttleTimers = Object.create(null);
                }
                if (debounce === undefined) {
                    debounce = self.params.debounce;
                }

                var now = self.now();
                var timer = self.cache.throttleTimers[eventId];
                var clear = function () {
                    delete self.cache.throttleTimers[eventId];
                };

                if (timer === undefined) {
                    self.cache.throttleTimers[eventId] = {
                        timestamp: now,
                        timeout: self.delay(clear, debounce)
                    };
                    self.call(callback, eventId);
                } else {
                    if (now - timer.timestamp >= debounce) {
                        self.cancelDelay(timer.timeout);
                        delete self.cache.throttleTimers[eventId];
                        self.call(callback, eventId);
                    } else {
                        self.cancelDelay(timer.timeout);
                        self.cache.throttleTimers[eventId].timeout = self.delay(clear, debounce);
                    }
                }
            } else {
                self.warn('::throttle', 'Функция обратного вызова для `%s` не передана', eventId);
            }
        },

        debounce: function (eventId, callback, debounce) {
            var self = this;

            if (typeof eventId === 'function') {
                debounce = callback;
                callback = eventId;
                eventId = self.hashify(callback);
            }

            if (typeof callback === 'function') {
                if (self.cache === undefined) {
                    self.cache = Object.create(null);
                }
                if (self.cache.debounceTimers === undefined) {
                    self.cache.debounceTimers = Object.create(null);
                }

                if (self.cache.debounceTimers[eventId] === undefined) {
                    self.call(callback, eventId);
                } else {
                    self.cancelDelay(self.cache.debounceTimers[eventId]);
                }

                if (debounce === undefined) {
                    debounce = self.params.debounce;
                }

                self.cache.debounceTimers[eventId] = self.delay(function () {
                    delete self.cache.debounceTimers[eventId];
                }, debounce);
            } else {
                self.warn('::debounce', 'Функция обратного вызова для `%s` не передана', eventId);
            }
        },

        delay: function (callback, timeout, onCancel) {
            var self = this;
            var delayId = self.hashify();

            if (!timeout) {
                timeout = 0;
            }

            DELAYS[delayId] = {
                callback: callback,
                onCancel: onCancel
            };

            function requestAF(tick) {
                var rAF = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame || window.oRequestAnimationFrame || undefined;
                if (!rAF) {
                    rAF = function (tick) {
                        return setTimeout(function () {
                            tick.call(window, delayId);
                        });
                    };
                }

                rAF.call(window, tick);

                return delayId;
            }

            function tick(timestamp) {
                if (DELAYS[delayId]) {
                    if (!DELAYS[delayId].start) {
                        DELAYS[delayId].start = timestamp;
                    }
                    var delta = timestamp - DELAYS[delayId].start;
                    if (delta >= timeout) {
                        self.call(DELAYS[delayId].callback, timestamp);
                        delete DELAYS[delayId];
                    } else {
                        requestAF(tick);
                    }
                }

                return delayId;
            }

            return requestAF(tick);
        },

        getDelays: function () {
            return $.extend(true, {}, DELAYS);
        },

        cancelDelay: function (delayId) {
            var self = this;
            var delay = DELAYS[delayId];
            if (delay && typeof delay.onCancel === 'function') {
                self.call(delay.onCancel);
            }
            return delay && delete DELAYS[delayId];
        },

        /**
         * @name stepFunction
         * @function
         * @param delta {Number} Изменение прогресса за шаг анимации
         * @param progress {Number} Прогресс выполнения анимации от 0 до 1
         * @param duration {Number} Продолжительность анимации
         * @param time {Number} Время в миллисекундах от начала анимации
         */
        /**
         * Анимация
         * @param duration {Number} продолжительность анимации в миллисекундах
         * @param step {stepFunction} функция вызываемая на каждый тик анимации
         * @param options {Object} Объект параметров анимации
         * @param options.done {Function} - Функция вызываемая при окончании анимации
         * @param options.cancel {Function} - Функция вызываемая при отмене анимации
         * @param options.easing {String|Function} - Имя или функция плавности. Доступное имя 'linear'
         * @returns {{cancel: function(): void, delayId: number}}
         */
        animate: function (duration, step, options) {
            options = options || {
                done: null,
                cancel: null,
                easing: 'linear'
            };

            var self = this;
            var startTime = self.now();
            var lastProgress = 0;
            var easing;
            var easings = {
                linear: function (x) {
                    return x;
                }
            };
            var result = {
                delayId: 0,
                cancel: function () {
                    self.cancelDelay(this.delayId);
                    self.call(options.cancel);
                }
            };

            if (getType(options.easing) === 'string') {
                easing = easings[options.easing] || easings.linear;
            } else if (getType(options.easing) === 'function') {
                easing = options.easing;
            } else {
                easing = easings.linear;
            }

            function frame(timestamp) {
                var time = timestamp - startTime;
                var progress = self.call(easing, self.clamp(0, time / duration, 1));
                var delta = progress - lastProgress;

                self.call(step, delta, progress, duration, time);
                lastProgress = progress;

                if (progress < 1) {
                    result.delayId = self.delay(frame);
                } else {
                    self.call(options.done);
                }
            }

            result.delayId = self.delay(frame);

            return result;
        },

        wait: function (waitingID, condition, callback, parallel) {
            var self = this;
            var waitingDelays = [10, 100, 200, 500];
            var maxWaitingTimes = 100;

            function abort() {
                if (self.params.debug) {
                    self.info('отмена %c%s%c', 'color: deepskyblue;', waitingID, '');
                }

                if (self.state.waitingTimeouts[waitingID]) {
                    self.state.waitingPhase[waitingID] = self.state.waitingDelaysQuantity[waitingID];

                    if (self.state.waitingBusyBy && self.state.waitingBusyBy === waitingID) {
                        self.state.waitingBusyBy = '';
                    }

                    self.cancelDelay(self.state.waitingTimeouts[waitingID]);
                }
            }

            function check(current) {
                var waitingID = current.waitingID;
                var condition = current.condition;
                var callback = current.callback;

                if (self.state.waitingBusyBy === waitingID || current.parallel) {
                    if (self.params.debug) {
                        self.info('проверка %c%s%c', 'color: deepskyblue;', waitingID, '');
                    }

                    if (!condition.call(self, abort)) {
                        if (self.state.waitingPhase[waitingID] === -1) {
                            self.call(abort);
                        } else if (self.state.waitingPhase[waitingID] < self.state.waitingDelaysQuantity[waitingID]) {
                            if (self.state.waitingTimes[waitingID] < maxWaitingTimes) {
                                self.state.waitingTimes[waitingID] += 1;
                            } else {
                                self.state.waitingTimes[waitingID] = 1;
                                self.state.waitingPhase[waitingID] += 1;
                            }

                            self.state.waitingTimeouts[waitingID] = self.delay(function () {
                                check(current);
                            }, waitingDelays[self.state.waitingPhase[waitingID]]);
                        } else {
                            if (self.state.waitingBusyBy && self.state.waitingBusyBy === waitingID) {
                                self.state.waitingBusyBy = '';
                            }
                            self.warn('Превышено время ожидания для %c%s%c', 'color: deepskyblue;', waitingID, '');
                        }
                    } else {
                        if (self.params.debug) {
                            var delta = parseFloat((now() - current.timestamp).toFixed(4));
                            self.info('%c%s%c готов%c (%dms)', 'color: deepskyblue;', waitingID, 'color: lime;', '', delta);
                        }

                        delete self.state.waitingTimes[waitingID];
                        delete self.state.waitingPhase[waitingID];
                        delete self.state.waitingDelaysQuantity[waitingID];

                        if (self.state.waitingBusyBy && self.state.waitingBusyBy === waitingID) {
                            self.state.waitingBusyBy = '';
                        }
                        self.call(callback);
                        if (!current.parallel) {
                            next();
                        }
                    }
                } else {
                    self.delay(function () {
                        check(current);
                    });
                }
            }

            function next(current) {
                if (!self.state.waitingBusyBy && self.state.waitingQueue.length) {
                    current = self.state.waitingQueue.shift();
                    self.state.waitingBusyBy = current.waitingID;

                    check(current);
                }
            }

            if (typeof condition === 'function' && typeof callback === 'function') {
                if (self.params.debug) {
                    self.info('ожидание %c%s%c...', 'color: deepskyblue;', waitingID, '');
                }

                if (self.state.waitingTimeouts === undefined) {
                    self.state.waitingTimeouts = Object.create(null);

                    self.state.waitingDelaysQuantity = self.state.waitingDelaysQuantity || {};

                    self.state.waitingTimes = self.state.waitingTimes || {};
                    self.state.waitingPhase = self.state.waitingPhase || {};

                    self.state.waitingQueue = self.state.waitingQueue || [];
                    if (!self.state.waitingBusyBy || self.state.waitingBusyBy && self.state.waitingBusyBy === waitingID) {
                        self.state.waitingBusyBy = '';
                    }
                }

                if (getType(waitingDelays) === 'array') {
                    self.state.waitingDelaysQuantity[waitingID] = waitingDelays.length;
                } else {
                    self.state.waitingDelaysQuantity[waitingID] = 1;
                }

                if (self.state.waitingTimes[waitingID] === undefined) {
                    self.state.waitingTimes[waitingID] = 0;
                    self.state.waitingPhase[waitingID] = 0;
                    var current = {
                        timestamp: now(),
                        waitingID: waitingID,
                        condition: condition,
                        callback: callback,
                        parallel: parallel,
                        abort: abort
                    };

                    if (parallel) {
                        if (self.params.debug) {
                            self.info('%c%s%c вне очереди', 'color: deepskyblue;', waitingID, '');
                        }
                        check(current);
                    } else {
                        if (self.params.debug) {
                            self.info('%c%s%c добавлен в очередь', 'color: deepskyblue;', waitingID, '');
                        }
                        self.state.waitingQueue = self.state.waitingQueue.concat(current);
                        next();
                    }
                }
            } else {
                self.warn('wait(%c%s%c, condition, callback): condition || callback не являются функцией', 'color: deepskyblue;', waitingID, '');
            }

            return {next: next, abort: abort};
        },

        addScripts: function (scripts, callback, timeout) {
            var self = this;
            var queue = [];
            var maxTimeout = timeout || 300000;// пять минут

            function checkQueue() {
                if (queue.length === 0) {
                    self.call(callback, null);
                }
            }

            function removeFromQueue(script) {
                var queueIndex = queue.indexOf(script.src);
                if (queueIndex !== -1) {
                    queue.splice(queueIndex, 1);
                }

                return Array.prototype.concat(queue);
            }

            function hasExports(script) {
                var result = true;
                var exports = Array.prototype.concat(script.exports);

                exports.forEach(function (variable) {
                    var pointer = window;
                    variable.split('.').forEach(function (key) {
                        pointer = pointer[key];

                        if (pointer === undefined) {
                            result = false;
                        }

                        return result;
                    });
                });

                return result;
            }

            function checkExports(script) {
                if (hasExports(script)) {
                    queue = removeFromQueue(script);

                    if (getType(script.plugins) === 'array' && script.plugins.length) {
                        queue = addToQueue(script.plugins);
                    }

                    checkQueue();
                } else {
                    var timeoutDelta = self.now() - script.timestamp;
                    if (timeoutDelta < maxTimeout) {
                        self.delay(function () {
                            checkExports(script);
                        });
                    } else {
                        queue = removeFromQueue(script);
                        var error = self.error({
                            action: 'DepotProto.addScripts',
                            message: 'Превышено время ожидания загрузки',
                            name: 'TimeoutError',
                            data: script
                        });
                        self.call(callback, error);
                    }
                }
            }

            function addToQueue(scripts) {
                Array.prototype.concat(scripts).forEach(function (script) {
                    if (!hasExports(script) && SCRIPTS.indexOf(script.src) === -1) {
                        queue = queue.concat(script.src);
                        var src = script.src;
                        var scriptElement = document.createElement('script');
                        scriptElement.onerror = function (event) {
                            queue = removeFromQueue(script);
                            var error = self.error({
                                action: 'DepotProto.addScripts',
                                message: 'Ошибка загрузки',
                                name: 'NetworkError',
                                data: script
                            });
                            self.call(callback, error);
                        };
                        scriptElement.onload = function () {
                            self.delay(function () {
                                script.timestamp = self.now();
                                checkExports(script);
                            });
                        };
                        SCRIPTS.push(src);
                        scriptElement.src = src;
                        document.head.appendChild(scriptElement);
                    } else {
                        script.timestamp = self.now();
                        checkExports(script);
                    }
                });

                return Array.prototype.concat(queue);
            }

            if (scripts) {
                queue = addToQueue(scripts);
            } else {
                self.call(callback, null);
            }

            return self;
        },

        getElements: function (params, getElementsOutside) {
            var self = this;
            var paramRe = /^([a-z0-9]+)Selector$/i;

            if (getElementsOutside === undefined) {
                getElementsOutside = self.params.getElementsOutside;
            }

            $.each(params ? params : self.params, function (paramName, paramValue) {
                if (typeof paramValue === 'string') {
                    var paramMatches = paramName.toString().match(paramRe);
                    if (paramMatches) {
                        var $element = self.$container.find(paramValue);
                        if (!$element.length && getElementsOutside) {
                            $element = $(paramValue);
                        }

                        if (paramMatches[1] !== 'container') {
                            self['$' + paramMatches[1]] = $element;
                        }
                    }
                }
            });

            return self;
        },

        getSelector: function (element) {
            var self = this;
            var selector;
            var $element;

            switch (getType(element)) {
                case 'string':
                    selector = '.' + element;
                    break;
                case 'undefined':
                    $element = self.$container;
                    break;
                case 'object':
                    $element = element;
                    break;
                default:
                    $element = $(element);
                    break;
            }

            if (!selector && $element && $element.length) {
                var className = $element.attr('class');
                var selectorRe = /(?:^|\s)(js-[a-z-]+)/;
                var matches = className.match(selectorRe);

                selector = matches ? '.' + matches[1] : '';
            }

            return selector;
        },

        on: function (eventType) {
            var self = this;

            if (eventType === undefined) {
                return self;
            }

            var eventParams = Array.prototype.slice.call(arguments, 1);
            if (getType(eventType) === 'array') {
                eventType = self.addEventNS(eventType[0], eventType[1]);
            } else {
                eventType = self.addEventNS(eventType);
            }

            eventParams.unshift(eventType);

            $.fn.on.apply(self.$container, eventParams);

            return self;
        },

        one: function (eventType) {
            var self = this;

            if (eventType === undefined) {
                return self;
            }

            var eventParams = Array.prototype.slice.call(arguments, 1);
            if (getType(eventType) === 'array') {
                eventType = self.addEventNS(eventType[0], eventType[1]);
            } else {
                eventType = self.addEventNS(eventType);
            }

            eventParams.unshift(eventType);

            $.fn.one.apply(self.$container, eventParams);

            return self;
        },

        off: function (eventType) {
            var self = this;

            if (eventType === undefined) {
                return self;
            }

            var eventParams = Array.prototype.slice.call(arguments, 1);
            if (getType(eventType) === 'array') {
                eventType = self.addEventNS(eventType[0], eventType[1]);
            } else {
                eventType = self.addEventNS(eventType);
            }

            eventParams.unshift(eventType);

            $.fn.off.apply(self.$container, eventParams);

            return self;
        },

        bind: function (eventType) {
            var self = this;

            if (eventType === undefined) {
                return self;
            }

            var eventParams;
            var additionalNS;
            var $element;

            if (getType(arguments[1]) === 'string') {
                additionalNS = arguments[1];
                $element = arguments[2];
                eventParams = Array.prototype.slice.call(arguments, 3);
                eventParams.unshift(self.addEventNS(eventType, additionalNS));
            } else {
                $element = arguments[1];
                eventParams = Array.prototype.slice.call(arguments, 2);
                eventParams.unshift(self.addEventNS(eventType));
            }

            $.fn.on.apply($element, eventParams);

            return self;
        },

        unbind: function (eventType) {
            var self = this;
            var eventParams;
            var additionalNS;
            var $element;

            if (getType(arguments[1]) === 'string') {
                additionalNS = arguments[1];
                $element = arguments[2];
                eventParams = Array.prototype.slice.call(arguments, 3);
                eventParams.unshift(self.addEventNS(eventType, additionalNS));
            } else {
                $element = arguments[1];
                eventParams = Array.prototype.slice.call(arguments, 2);
                eventParams.unshift(self.addEventNS(eventType));
            }

            $.fn.off.apply($element, eventParams);

            return self;
        },

        trigger: function (eventType) {
            var self = this;

            var eventParams = Array.prototype.slice.call(arguments, 1);
            if (eventParams.length === 1) {
                eventParams = eventParams[0];
            }
            self.$container.trigger(eventType, eventParams);

            return self;
        },

        triggerTo: function (element, eventType) {
            var self = this;
            var eventParams;
            var additionalNS;
            var $element;

            switch (getType(element)) {
                case 'string':
                    $element = self.$container.find(element);
                    break;
                case 'object':
                    $element = element;
                    break;
                default:
                    $element = $(element);
                    break;
            }

            if (getType(arguments[2]) === 'string') {
                additionalNS = arguments[2];
                eventParams = Array.prototype.slice.call(arguments, 3);
                eventParams.unshift(self.addEventNS(eventType, additionalNS));
            } else {
                eventParams = Array.prototype.slice.call(arguments, 2);
                eventParams.unshift(self.addEventNS(eventType));
            }

            if ($element.length) {
                $.fn.trigger.apply($element, eventParams);
            }

            return self;
        },

        call: function (callback) {
            var self = this;

            var args = Array.prototype.slice.call(arguments);

            args.shift();

            if (typeof callback === 'function') {
                return callback.apply(self, args);
            }
        },

        filterItems: function ($items, params, eachCallback) {
            var self = this;
            var $matched;

            $items.each(function (i, item) {
                var all = false;
                var matched = false;
                var $item = $(item);
                var itemData = $item.data();

                $.each(params, function (paramName, paramValue) {
                    if (paramName !== undefined && paramValue !== undefined) {
                        paramName = paramName.toString();
                        paramValue = paramValue.toString();

                        if (paramValue === 'all') {
                            all = true;
                        }

                        var itemValue = itemData[paramName];
                        if (!itemValue) {
                            return false;
                        }

                        var itemValueArray = itemValue.toString().split(/[ ,]+/);
                        var paramValueArray = paramValue.split(/[ ,]+/);

                        $.each(itemValueArray, function (j, value) {
                            if (value !== undefined) {
                                value = value.toString();

                                if (paramValueArray.indexOf(value) !== -1) {
                                    matched = true;
                                    return false;
                                }
                            }
                        });
                    } else {
                        matched = false;
                    }
                });

                if (matched || all) {
                    if ($matched) {
                        $matched.add(item);
                    } else {
                        $matched = $(item);
                    }
                }

                self.call(eachCallback, $item, matched, all);
            });

            return $matched;
        },

        applyMixins: function () {
            var self = this;

            self.call(self.params.preInit);

            if (self.params.extend && $.isPlainObject(self.params.extend)) {
                self = $.extend(true, self, self.params.extend);
            }

            if (self.params.mixins && self.params.mixins.length) {
                $.each(self.params.mixins, function (i, mixin) {
                    if ($.isPlainObject(mixin)) {
                        self = $.extend(true, self, mixin);
                    } else {
                        self.error({
                            action: 'DepotProto.applyMixins',
                            data: {
                                mixin: mixin
                            },
                            name: 'TypeError',
                            message: 'Миксин должен быть объектом'
                        });
                    }
                });
            }

            return self;
        },

        proxyCallback: function (defaultCallback, newCallback) {
            var self = this;
            return function () {
                var result;
                if (typeof defaultCallback === 'function') {
                    result = defaultCallback.apply(self, arguments);
                }

                return newCallback.apply(result, arguments);
            };
        },

        hasPlugin: function (pluginName) {
            var self = this;

            var hasPlugin = $[pluginName] || $.fn[pluginName];

            if (!hasPlugin) {
                self.warn('Необходим плагин *%s*', pluginName);
            }

            return hasPlugin;
        },

        sandbox: function (containerSelector, settings, name) {
            var dp = this;

            var $container = typeof containerSelector === 'object' ? containerSelector : $(containerSelector || document);

            $container.each(function (i, container) {
                function Sandbox() {
                    return this;
                }

                Sandbox.prototype = $.extend(true, {}, dp);
                var self = new Sandbox();
                self.pluginName += '::' + (name || 'sandbox');

                if (!$.data(container, self.pluginName)) {
                    $.data(container, self.pluginName, self._init.call(self, container, settings));
                }
            });

            return settings;
        },

        prefixed: function (css) {
            var self = this;
            var prefixed = Object.create(null);

            if (window.Modernizr) {
                $.each(css, function (property) {
                    var value = css[property];

                    var prefixedProperty = Modernizr.prefixedCSS(property);
                    if (prefixedProperty === false) {
                        prefixedProperty = property;
                    }

                    var prefixedValue = Modernizr.prefixedCSSValue(prefixedProperty, value);
                    if (prefixedValue === false) {
                        prefixedValue = value;
                    }

                    prefixed[prefixedProperty] = prefixedValue;
                });
            } else {
                prefixed = css;
                self.warn('Необходим *Modernizr* с функциями _prefixedCSS()_ и _prefixedCSSValue()_\n',
                    'https://modernizr.com/download?prefixedcss-prefixedcssvalue');
            }

            return prefixed;
        },

        unbindEvents: function () {
            var self = this;

            self.off('');
            self.unbind('', self.$WINDOW);
            self.unbind('', self.$DOCUMENT);
            self.unbind('', self.$HTMLBODY);

            return self;
        },

        _init: function (container, settings) {
            var self = this;

            self.hash = self.hashify();
            self.eventNameSpace = self.getNameSpace();
            self.params = self.translate($.extend(true, Object.create(null), self.defaults, settings));

            self.applyMixins();

            self.$container = $(container);
            self.container = container;

            self.call(self.swapContainer);

            self.getElements();

            self.state = self.getInitialState();
            self.cache = Object.create(null);

            self.one('destroy', function () {
                self.unbindEvents();
            });

            self.call(self.params.beforeInit);

            self.call(self.bindEvents);

            self.call(self.init);

            return self;
        }
    };

    $.depotProto = depotProto;
    $.depotSandbox = function () {
        var args = Array.prototype.slice.call(arguments);
        depotProto.sandbox.apply(depotProto, args);
        return function (selector) {
            args[0] = selector || args[0];
            depotProto.sandbox.apply(depotProto, args);
        };
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        dictionary: {
            buttons: {
                apply: {ru: 'Применить', en: 'Apply'}
            }
        },
        calendarMonthPicker: {
            monthPickerGridTemplate: '<div class="calendar__grid">#{for month in monthList}${monthPickerButtonTemplate}#{endfor}</div>',
            monthPickerButtonTemplate: '<button class="calendar__month button button_calendar#{if month.isActive} is-active#{endif} ${monthPickerButtonsSelector|substr(1)}" type="button" data-date="${month.dateTime|date(Y-m-d)}"#{if month.disabled} disabled#{endif}><span class="button__label">${month.label}</span></button>#{if month.rowComplete}<div class="calendar__break"></div>#{endif}',
            monthPickerApplyTemplate: '<button class="calendar__button button button_general button_secondary button_block button_small ${monthPickerApplySelector|substr(1)}" type="button"><span class="button__label">_{buttons.apply}</span></button>',
            monthPickerButtonsSelector: '.js-calendar-picker-month',
            monthPickerApplySelector: '.js-calendar-picker-apply',
            onInit: null,
            onApply: null
        }
    };

    $.calendarMonthPickerMixin = {
        monthPickerChange: function (date) {
            var self = this;
            var dateTime = self.parseDateTime(date);

            self.state.calendarMonthPicker.year = dateTime.getFullYear();
            self.state.calendarMonthPicker.month = dateTime.getMonth() + 1;
            self.state.calendarMonthPicker.date = date;
            self.state.calendarMonthPicker.dateTime = dateTime;

            self.$monthPickerButtons.removeClass(self.params.activeClassName)
                .filter('[data-date="' + self.state.calendarMonthPicker.date + '"]').addClass(self.params.activeClassName);

            return self;
        },
        initCalendarMonthPicker: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {

                return $.extend(true, self.cleanObject(this), {
                    calendarMonthPicker: {
                        year: self.state.dateTime.getFullYear(),
                        month: self.state.dateTime.getMonth() + 1,
                        date: self.state.date,
                        dateTime: self.state.dateTime
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.getElements(self.params.calendarMonthPicker);

            self.state = self.getInitialState();

            self.processTemplateContext = self.proxyCallback(self.processTemplateContext, function () {
                var templateContext = this;

                templateContext.monthPickerButtonTemplate = self.params.calendarMonthPicker.monthPickerButtonTemplate;
                templateContext.monthPickerButtonsSelector = self.params.calendarMonthPicker.monthPickerButtonsSelector;

                templateContext.monthPickerGridTemplate = self.params.calendarMonthPicker.monthPickerGridTemplate;

                templateContext.monthPickerApplyTemplate = self.params.calendarMonthPicker.monthPickerApplyTemplate;
                templateContext.monthPickerApplySelector = self.params.calendarMonthPicker.monthPickerApplySelector;

                templateContext.monthList = function getMonthList() {
                    var monthList = [];
                    var dateTime = self.state.dateTime;
                    var currentYear = dateTime.getFullYear();
                    for (var m = 0; m <= 11; m += 1) {
                        var currentDateTime = new Date(currentYear, m, 1);
                        var currentDate = self.formatDate(currentDateTime);

                        monthList.push({
                            value: m,
                            label: self.getText('month.' + m + '.full'),
                            dateTime: currentDateTime,
                            isActive: self.state.calendarMonthPicker.date === currentDate,
                            disabled: !self.dateTimeInRange(currentDateTime, self.state.minDateTime, self.state.maxDateTime),
                            rowComplete: (m + 1) % 3 === 0
                        });
                    }

                    return monthList;
                };

                return templateContext;
            });

            self.params.onChange = self.proxyCallback(self.params.onChange, function () {
                self.getElements(self.params.calendarMonthPicker);
            });

            self.bindEvents = self.proxyCallback(self.bindEvents, function () {
                self.on('click', self.params.calendarMonthPicker.monthPickerButtonsSelector, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    var $button = $(this);
                    var date = $button.data('date');

                    self.monthPickerChange(date);
                });
                self.on('click', self.params.calendarMonthPicker.monthPickerApplySelector, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    self.call(self.params.calendarMonthPicker.onApply);
                });
            });

            self.call(self.params.calendarMonthPicker.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        dictionary: {
            buttons: {
                backwards: {ru: 'Предыдущий', en: 'Previous'},
                forwards: {ru: 'Следующий', en: 'Next'}
            }
        },
        calendarNavigation: {
            step: 'month',

            beforeTemplate: '<div class="calendar__before">${monthTemplate}${yearTemplate}${buttonBackwardsTemplate}${buttonForwardsTemplate}</div>',
            afterTemplate: '<div class="calendar__after"></div>',

            monthSelectTemplate: '<select class="calendar__select ${monthSelector|substr(1)}">#{for option in monthSelect}<option value="${option.value}"#{if option.selected} selected#{endif}>${option.label}</option>#{endfor}</select>',
            yearSelectTemplate: '<select class="calendar__select ${yearSelector|substr(1)}">#{for option in yearSelect}<option value="${option.value}"#{if option.selected} selected#{endif}>${option.label}</option>#{endfor}</select>',

            buttonBackwardsTemplate: '<button class="calendar__button calendar__button_backwards button button_round button_secondary ${buttonBackwardsSelector|substr(1)}" type="button" aria-label="${backwardsLabel}" title="${backwardsLabel}" ${backwardsDisabled}><span class="button__icon button__icon_backwards"></span></button>',
            buttonForwardsTemplate: '<button class="calendar__button calendar__button_forwards button button_round button_secondary ${buttonForwardsSelector|substr(1)}" type="button" aria-label="${forwardsLabel}" title="${forwardsLabel}" ${forwardsDisabled}><span class="button__icon button__icon_forwards"></span></button>',

            monthSelector: '.js-calendar-month',
            yearSelector: '.js-calendar-year',

            buttonBackwardsSelector: '.js-calendar-backwards',
            buttonForwardsSelector: '.js-calendar-forwards',

            onInit: null
        }
    };

    $.calendarNavigationMixin = {
        initCalendarNavigation: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {

                return $.extend(true, self.cleanObject(this), {
                    calendarNavigation: {}
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.getElements(self.params.calendarNavigation);

            self.state = self.getInitialState();

            self.processTemplateContext = self.proxyCallback(self.processTemplateContext, function () {
                var templateContext = this;

                templateContext.monthSelect = function createMonthSelect() {
                    var select = [];
                    var dateTime = self.state.dateTime;
                    var currentYear = dateTime.getFullYear();
                    var currentMonth = dateTime.getMonth();

                    for (var m = 0; m <= 11; m += 1) {
                        var currentDateTime = new Date(currentYear, m, 1);
                        select.push({
                            value: m,
                            label: self.getText('month.' + m + '.full'),
                            disabled: !self.dateTimeInRange(currentDateTime, self.state.minDateTime, self.state.maxDateTime),
                            selected: m === currentMonth
                        });
                    }
                    return select;
                };
                templateContext.yearSelect = function createYearSelect() {
                    var select = [];
                    var dateTime = self.state.dateTime;
                    var currentYear = dateTime.getFullYear();
                    var minDateTime = self.state.minDateTime;
                    var maxDateTime = self.state.maxDateTime;
                    var realYear = new Date().getFullYear();
                    var minYear = minDateTime ? minDateTime.getFullYear() : realYear - 100;
                    var maxYear = maxDateTime ? maxDateTime.getFullYear() : realYear;

                    for (var y = maxYear; y >= minYear; y -= 1) {
                        select.push({
                            value: y,
                            label: y,
                            selected: y === currentYear
                        });
                    }

                    return select;
                };

                templateContext.monthSelectTemplate = self.params.calendarNavigation.monthSelectTemplate;
                templateContext.yearSelectTemplate = self.params.calendarNavigation.yearSelectTemplate;
                templateContext.monthSelector = self.params.calendarNavigation.monthSelector;
                templateContext.yearSelector = self.params.calendarNavigation.yearSelector;

                templateContext.buttonBackwardsTemplate = self.params.calendarNavigation.buttonBackwardsTemplate;
                templateContext.buttonForwardsTemplate = self.params.calendarNavigation.buttonForwardsTemplate;
                templateContext.buttonBackwardsSelector = self.params.calendarNavigation.buttonBackwardsSelector;
                templateContext.buttonForwardsSelector = self.params.calendarNavigation.buttonForwardsSelector;

                templateContext.backwardsLabel = self.getText('buttons.backwards');
                templateContext.forwardsLabel = self.getText('buttons.forwards');

                templateContext.backwardsDisabled = function () {
                    var dateTime = self.state.dateTime;
                    var newDateTime;

                    if (self.params.calendarNavigation.step === 'year') {
                        newDateTime = new Date(dateTime.getFullYear() - 1, dateTime.getMonth(), 1);
                    } else {
                        newDateTime = new Date(dateTime.getFullYear(), dateTime.getMonth() - 1, 1);
                    }
                    var dateTimeInRange = self.dateTimeInRange(newDateTime, self.state.minDateTime, null);

                    return dateTimeInRange ? '' : 'disabled';
                };
                templateContext.forwardsDisabled = function () {
                    var dateTime = self.state.dateTime;
                    var newDateTime;

                    if (self.params.calendarNavigation.step === 'year') {
                        newDateTime = new Date(dateTime.getFullYear() + 1, dateTime.getMonth(), 1);
                    } else {
                        newDateTime = new Date(dateTime.getFullYear(), dateTime.getMonth() + 1, 1);
                    }

                    var dateTimeInRange = self.dateTimeInRange(newDateTime, null, self.state.maxDateTime);

                    return dateTimeInRange ? '' : 'disabled';
                };

                return templateContext;
            });

            self.params.onChange = self.proxyCallback(self.params.onChange, function () {
                self.getElements(self.params.calendarNavigation);
            });

            self.bindEvents = self.proxyCallback(self.bindEvents, function () {
                self.on('click', self.params.calendarNavigation.buttonBackwardsSelector, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    var dateTime = self.state.dateTime;
                    var minDateTime = self.state.minDateTime;
                    var maxDateTime = self.state.maxDateTime;
                    var newDateTime;

                    if (self.params.calendarNavigation.step === 'year') {
                        newDateTime = new Date(dateTime.getFullYear() - 1, dateTime.getMonth(), 1);
                    } else {
                        newDateTime = new Date(dateTime.getFullYear(), dateTime.getMonth() - 1, 1);
                    }

                    if ((minDateTime && newDateTime >= minDateTime || !minDateTime) && (maxDateTime && newDateTime <= maxDateTime || !maxDateTime)) {
                        self.render(newDateTime);
                    }
                });

                self.on('click', self.params.calendarNavigation.buttonForwardsSelector, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    var dateTime = self.state.dateTime;
                    var minDateTime = self.state.minDateTime;
                    var maxDateTime = self.state.maxDateTime;
                    var newDateTime;

                    if (self.params.calendarNavigation.step === 'year') {
                        newDateTime = new Date(dateTime.getFullYear() + 1, dateTime.getMonth(), 1);
                    } else {
                        newDateTime = new Date(dateTime.getFullYear(), dateTime.getMonth() + 1, 1);
                    }

                    if ((minDateTime && newDateTime >= minDateTime || !minDateTime) && (maxDateTime && newDateTime <= maxDateTime || !maxDateTime)) {
                        self.render(newDateTime);
                    }
                });

                self.on('change input', self.params.calendarNavigation.monthSelector, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    var month = parseInt($(this).val(), 10);
                    var dateTime = self.state.dateTime;
                    var newDateTime = new Date(dateTime.getFullYear(), month, dateTime.getDate());

                    self.render(newDateTime);
                });

                self.on('change input', self.params.calendarNavigation.yearSelector, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    var year = parseInt($(this).val(), 10);
                    var dateTime = self.state.dateTime;
                    var newDateTime = new Date(year, dateTime.getMonth(), dateTime.getDate());

                    self.render(newDateTime);
                });
            });

            self.call(self.params.calendarNavigation.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    function DepotAnchors(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotAnchors.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotAnchors',

        defaults: {
            stickySelector: '.js-header',
            sectionsSelector: '.js-anchors-section',
            buttonsSelector: '.js-anchors-button',
            getElementsOutside: true,
            paramName: 'section'
        },

        getInitialState: function () {
            var self = this;

            return {
                hashRe: RegExp(self.params.paramName + '=(.*)'),
                bounds: {},
                viewport: {},
                sectionId: null,
                isAnimated: false
            };
        },

        setActive: function (sectionId) {
            var self = this;
            var changed = false;

            if (self.state.sectionId !== sectionId) {
                self.setPassive(self.state.sectionId);

                self.state.sectionId = sectionId;

                self.$buttons.filter('[href="#' + sectionId + '"]').addClass(self.params.activeClassName);

                changed = true;
            }

            $.depotHash.replaceMatched(self.state.hashRe, self.params.paramName + '=' + sectionId);

            return changed;
        },

        setPassive: function (sectionId) {
            var self = this;

            self.$buttons.filter('[href="#' + sectionId + '"]').removeClass(self.params.activeClassName);

            return self;
        },

        goTo: function (sectionId, force, returnTo) {
            var self = this;

            var bounds = self.getBounds(sectionId);
            var viewport = self.getViewport();
            if (bounds && viewport) {
                var position = bounds.top - viewport.offsetTop;

                if (self.setActive(sectionId) || returnTo) {
                    self.state.isAnimated = true;

                    var eventList = 'wheel mousewheel DOMMouseScroll touchmove pointermove MSPointerMove';

                    self.bind(eventList, self.$BODY, function (e) {
                        if (e.type !== 'pointermove' || e.type === 'pointermove' && e.originalEvent.pointerType !== 'mouse') {
                            self.$HTMLBODY.stop();
                            self.unbind(eventList, self.$BODY);
                        }
                    });

                    self.$HTMLBODY.stop().animate({
                        scrollTop: position
                    }, force ? 0 : self.params.duration, function () {
                        self.state.isAnimated = false;
                        self.unbind(eventList, self.$BODY);
                    });
                }
            }

            return self;
        },

        getBounds: function (sectionId) {
            var self = this;

            self.updateBounds(sectionId);

            return self.state.bounds[sectionId];
        },

        getViewport: function () {
            var self = this;

            return self.state.viewport;
        },

        updateBounds: function (sectionId) {
            var self = this;
            var $sections = self.$sections;

            if (sectionId !== undefined) {
                $sections = self.$sections.filter('[id="' + sectionId + '"]');
            }

            $sections.each(function (i, section) {
                var $section = $(section);
                var sectionId = section.id;
                var sectionTop = $section.offset().top;
                var sectionBottom = sectionTop + $section.outerHeight(true);

                self.state.bounds[sectionId] = {
                    top: sectionTop,
                    bottom: sectionBottom
                };
            });

            return self;
        },

        updateViewport: function () {
            var self = this;

            var offsetTop = 0;

            self.$sticky.each(function (i, block) {
                offsetTop += block.offsetHeight;
            });

            var viewportTop = self.$WINDOW.scrollTop();
            var windowHeight = self.$WINDOW.height();
            var positionTop = viewportTop + offsetTop;
            var viewportBottom = viewportTop + windowHeight - offsetTop;
            var viewportMiddle = positionTop + (windowHeight - offsetTop) / 2;

            self.state.viewport = {
                top: viewportTop,
                bottom: viewportBottom,
                middle: viewportMiddle,
                offsetTop: offsetTop,
                positionTop: positionTop
            };

            return self;
        },

        checkBounds: function () {
            var self = this;

            var viewport = self.getViewport();
            var currentSectionId = null;

            if (!self.state.isAnimated) {
                $.each(self.state.bounds, function (sectionId, bounds) {
                    var doContinue = true;
                    var fullInView = bounds.top >= viewport.positionTop && bounds.bottom <= viewport.bottom;
                    var centerInView = bounds.top <= viewport.positionTop && bounds.bottom >= viewport.bottom;
                    var bottomInView = bounds.top <= viewport.positionTop && bounds.bottom >= viewport.middle;
                    var partInView = bounds.top <= viewport.middle && bounds.bottom >= viewport.bottom;

                    if (fullInView || centerInView || bottomInView || partInView) {
                        currentSectionId = sectionId;
                        doContinue = false;
                    }

                    return doContinue;
                });

                if (currentSectionId) {
                    self.setActive(currentSectionId);
                } else {
                    $.depotHash.removeMatched(self.state.hashRe);
                }
            }

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('resize', self.$WINDOW, function () {
                self.throttle('resize', function () {
                    self.updateViewport();
                    self.updateBounds();
                }, 15);
            });

            self.bind('scroll', self.$WINDOW, function () {
                self.throttle('scroll', function () {
                    self.updateViewport();
                    self.checkBounds();
                }, 15);
            });

            self.bind('load', self.$WINDOW, function () {
                self.throttle('load', function () {
                    self.updateBounds();
                    self.checkBounds();
                });
            });

            self.$container.on('click', self.params.buttonsSelector, function (e) {
                e.preventDefault();
                var sectionId = $.depotHash.get(this);

                self.debounce('go', function () {
                    self.goTo(sectionId, false, true);
                });
            });

            // $.depotHash.onChange(function () {
            //     $.depotHash.getMatched(self.state.hashRe, function (hash) {
            //         self.goTo(hash.replace(self.state.hashRe, '$1'));
            //     });
            // });

            return self;
        },

        init: function () {
            var self = this;

            self.updateViewport();
            self.updateBounds();

            $.depotHash.getMatched(self.state.hashRe, function (hash) {
                self.goTo(hash.replace(self.state.hashRe, '$1'), true);
            });

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotAnchors = function depotCalendar(settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotAnchors', new DepotAnchors(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function DepotCalendar(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    function fillArray(array, item, quantity) {
        if ($.depotProto.getType(array) === 'array') {
            for (var i = 1; i <= quantity; i += 1) {
                array.push(item);
            }
        }
        return array;
    }

    DepotCalendar.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotCalendar',

        defaults: {
            viewportSelector: '.js-calendar-viewport',
            daysSelector: '.js-calendar-day',
            template: '${beforeTemplate}<div class="calendar__viewport ${viewportSelector|substr(1)}">${gridTemplate}</div>${afterTemplate}',
            beforeTemplate: '<div class="calendar__before">${monthTemplate} ${yearTemplate}</div>',
            afterTemplate: '<div class="calendar__after"></div>',
            monthTemplate: '<div class="calendar__month">${month}</div>',
            yearTemplate: '<div class="calendar__year">${year}</div>',
            labelsTemplate: '<div class="calendar__labels">#{for label in labels}<div class="calendar__label">${label.short}</div>#{endfor}</div>',
            gridTemplate: '<div class="calendar__grid">${labelsTemplate}#{for day in days}#{if day.day}<div class="calendar__day ${day.className|join( )} ${daysSelector|substr(1)}" data-date="${day.dateTime}"#{if day.extra} ${day.extra|extra}#{endif}>${dayTemplate}</div>#{if day.weekComplete}<div class="calendar__break"></div>#{endif}#{else}<div class="calendar__day is-external"></div>#{endif}#{endfor}</div>',
            dayTemplate: '<time datetime="${day.dateTime}">${day.day}</time>'
        },

        dateTimeInRange: function (dateTime, minDateTime, maxDateTime) {
            var self = this;

            var moreThanMin = minDateTime && dateTime >= minDateTime || !minDateTime;
            var lessThanMax = maxDateTime && dateTime <= maxDateTime || !maxDateTime;

            return moreThanMin && lessThanMax;
        },

        parseDateTime: function parseDateTime(date, defaultDateTime) {
            if (date instanceof Date) {
                return date;
            } else if (typeof date === 'string') {
                var d = date.split(/[^0-9]/).map(function (value) {
                    return parseInt(value, 10);
                });
                return new Date(d[0], d[1] - 1, d[2], d[3] || null, d[4] || null, d[5] || null);
            } else {
                return defaultDateTime !== undefined ? defaultDateTime : new Date();
            }
        },

        formatDate: function formatDate(datetime, format) {
            var self = this;

            return self.format('#{if format}${datetime|date(${format})}#{else}${datetime|date}#{endif}', {
                datetime: datetime,
                format: format
            });
        },

        processDayData: function (dayData) {
            var self = this;

            if (dayData.dateTime === self.formatDate(new Date())) {
                dayData.className.push('is-current');
            }

            return dayData;
        },

        processTemplateContext: function (templateContext) {
            return templateContext;
        },

        getDaysArray: function (dateTime) {
            var self = this;

            var year = dateTime.getFullYear();
            var month = dateTime.getMonth();
            var firstDate = new Date(year, month, 1);
            var lastDate = new Date(year, month + 1, 0);
            var firstDay = firstDate.getDay();
            var lastDay = lastDate.getDay();
            var daysArray = fillArray([], false, firstDay - 1 >= 0 ? firstDay - 1 : 6);

            var dayIndex = daysArray.length;

            for (var day = 1; day <= lastDate.getDate(); day += 1) {
                dayIndex += 1;
                var currentDate = new Date(year, month, day);
                var currentDateTime = self.formatDate(currentDate);
                var dayData = self.processDayData({
                    year: year,
                    month: month,
                    day: day,
                    dateTime: currentDateTime,
                    date: currentDate,
                    weekComplete: dayIndex % 7 === 0 && currentDate.getTime() !== lastDate.getTime(),
                    className: [],
                    extra: {}
                });

                daysArray.push(dayData);
            }

            return fillArray(daysArray, false, lastDay === 0 ? 0 : 7 - lastDay);
        },

        getLabelsArray: function () {
            var self = this;

            var labelsArray = [];

            for (var i = 0; i < 7; i += 1) {
                var dayNumber = i + 1;
                if (dayNumber > 6) {
                    dayNumber = 0;
                }
                labelsArray.push(self.getText('weekday.' + dayNumber));
            }

            return labelsArray;
        },

        render: function (dateTime) {
            var self = this;

            if (dateTime) {
                self.state.date = self.formatDate(dateTime);
                self.state.dateTime = dateTime;
            } else {
                dateTime = self.state.dateTime;
            }

            var calendarContext = self.processTemplateContext({
                viewportSelector: self.params.viewportSelector,
                labelsTemplate: self.params.labelsTemplate,
                gridTemplate: self.params.gridTemplate,
                dayTemplate: self.params.dayTemplate,
                daysSelector: self.params.daysSelector,
                beforeTemplate: self.params.beforeTemplate,
                afterTemplate: self.params.afterTemplate,
                monthTemplate: self.params.monthTemplate,
                yearTemplate: self.params.yearTemplate,

                month: function () {
                    return self.formatDate(dateTime, 'F');
                },
                year: function () {
                    return self.formatDate(dateTime, 'Y');
                },
                days: function () {
                    return self.getDaysArray(dateTime);
                },
                labels: self.getLabelsArray,
                dictionary: self.params.dictionary
            });
            var calendarHTML = self.format(self.params.template, calendarContext);

            self.$container.html(calendarHTML);
            self.call(self.params.onChange);

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.on('calendar:view', function (event, data) {
                var dateTime = self.parseDateTime(data.dateTime);

                self.render(dateTime);
            });

            return self;
        },

        getInitialState: function () {
            var self = this;
            var containerData = self.$container.data();
            var dateTime = self.parseDateTime(containerData['date']);
            var date = self.formatDate(dateTime);
            var minDateTime = self.parseDateTime(containerData['min'], null);
            var maxDateTime = self.parseDateTime(containerData['max'], null);

            return {
                date: date,
                dateTime: dateTime,
                minDateTime: minDateTime,
                maxDateTime: maxDateTime
            };
        },

        init: function init() {
            var self = this;

            self.render(self.state.dateTime);

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotCalendar = function depotCalendar(settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotCalendar', new DepotCalendar(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function DepotDropdown(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotDropdown.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotDropdown',

        defaults: {
            toggleSelector: '.js-dropdown-toggle',
            panelSelector: '.js-dropdown-panel',
            kickOff: false,
            onClick: null,
            beforeExpand: null,
            onExpand: null,
            onCollapse: null
        },

        expand: function () {
            var self = this;

            var defaultPrevented = self.call(self.params.beforeExpand);

            if (!defaultPrevented) {
                self.state.expanded = true;

                if (self.hasPlugin('aria')) {
                    self.$toggle.aria('expanded', 'true');
                    self.$panel.attr('hidden', false);
                }

                if (self.params.kickOff) {
                    self.bind('click', self.$DOCUMENT, function (event) {
                        if (!$(event.target).closest(self.$container.get(0)).length) {
                            self.collapse();
                        }
                    });

                    self.bind('keyup', self.$DOCUMENT, function (event) {
                        if (event.which === self.KEYS.ESCAPE) {
                            self.collapse();
                        }
                    });
                }

                self.call(self.params.onExpand);
            }

            return self;
        },

        collapse: function () {
            var self = this;

            self.state.expanded = false;

            if (self.hasPlugin('aria')) {
                self.$toggle.aria('expanded', 'false');
                self.$panel.attr('hidden', true);
            }

            if (self.params.kickOff) {
                self.unbind('click', self.$DOCUMENT);
                self.unbind('keyup', self.$DOCUMENT);
            }

            self.call(self.params.onCollapse);

            return self;
        },

        toggle: function () {
            var self = this;

            if (self.state.expanded) {
                self.collapse();
            } else {
                self.expand();
            }

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('click', self.$toggle, function (event) {
                // для поддержки внешней кнопки
                event.preventDefault();
                event.stopPropagation();

                self.debounce('toggle', function () {
                    self.toggle();
                });
            });

            self.on('click', self.params.panelSelector, function (event) {
                self.call(self.params.onClick, event);
            });

            return self;
        },
        init: function () {
            var self = this;

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotDropdown = function (settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotDropdown', new DepotDropdown(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function DepotFigure(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotFigure.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotFigure',

        defaults: {
            sourceSelector: '.js-figure-source',
            captionSelector: '.js-figure-caption',
            zoomSelector: '.js-figure-zoom',
            playSelector: '.js-figure-play',
            excludeSelector: '.is-cloned',
            dataCollectionParam: 'collection',
            dataTypeParam: 'type'
        },

        getItemId: function ($element) {
            return $element.data('id');
        },

        getItemType: function ($element) {
            return $element.data('type') || $element.attr('itemprop');
        },

        getItemSrc: function ($element) {
            return $element.data('original') || $element.attr('src');
        },

        getItemUrl: function ($element) {
            return $element.data('url') || '';
        },

        getItemThumb: function ($element) {
            return $element.data('thumb') || $element.data('poster') || $element.attr('src');
        },

        getItemCaption: function ($element) {
            return $element && $element.length ? $element.text().trim() : undefined;
        },

        getCollectionId: function ($element) {
            var self = this;
            return $element.data(self.params.dataCollectionParam);
        },

        getItemData: function ($item) {
            var self = this;

            if ($item === undefined) {
                $item = self.$container;
            }
            var $source = $item.find(self.params.sourceSelector);

            var id = self.getItemId($item);
            var collectionId = self.getCollectionId($item);
            var type = self.getItemType($item);
            var src = self.getItemSrc($source);
            var thumb = self.getItemThumb($source);
            var url = self.getItemUrl($source);
            var caption = self.getItemCaption($item.find(self.params.captionSelector));

            return {
                id: id,
                type: type,
                src: src,
                thumb: thumb,
                url: url,
                caption: caption,
                collection: collectionId
            };
        },

        getCollectionData: function () {
            var self = this;
            var data = {
                item: self.getItemData(),
                collection: {
                    items: []
                }
            };

            var collectionSlug = self.$container.data(self.params.dataCollectionParam);

            if (typeof collectionSlug === 'string' && collectionSlug.length) {
                var $collection = $(self.format('[data-${param}="${value}"]', {
                    param: self.params.dataCollectionParam,
                    value: collectionSlug
                }));

                if ($collection.length) {
                    $collection.filter(function (i, item) {
                        return $(item).closest(self.params.excludeSelector).length === 0;
                    }).each(function (i, item) {
                        data.collection.items.push(self.getItemData($(item)));
                    });
                }
            } else {
                data.collection.items.push(self.state.item);
            }

            return data;
        },

        stop: function () {
            var self = this;
            if (self.state.item.type === 'video') {
                var video = self.$source.get(0);
                if (typeof video.pause === 'function') {
                    video.pause();
                }
            } else if (self.state.item.type === 'youtube') {
                if (self.$iframe && self.$iframe.length) {
                    self.$iframe.remove();
                }
            }

            self.$play.prop('disabled', false);

            return self;
        },

        play: function () {
            var self = this;
            self.$play.prop('disabled', true);

            if (self.state.item.type === 'video') {
                var video = self.$source.get(0);
                video.play();
            } else if (self.state.item.type === 'youtube') {
                self.addScripts({src: 'https://www.youtube.com/iframe_api', exports: 'YT'}, function (error) {
                    if (!error) {
                        self.$iframe = $('<div class="figure__iframe" id="' + self.state.item.url + '">');
                        self.$source.parent().append(self.$iframe);
                        YT.ready(function () {
                            var player = new YT.Player(self.state.item.url, {
                                width: self.$iframe.width(),
                                height: self.$iframe.height(),
                                videoId: self.state.item.url,
                                playerVars: {
                                    controls: 1,
                                    enablejsapi: 1,
                                    fs: 0,
                                    hl: self.LANGUAGE,
                                    origin: window.location.origin,
                                    color: 'white',
                                    rel: 0,
                                    showinfo: 0,
                                    autoplay: 1
                                }
                            });
                            self.$iframe = $(player.f);
                        });
                    }
                });
            }

            return self;
        },

        zoom: function () {
            var self = this;

            self.$WINDOW.trigger('screen:show', self.getCollectionData());

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.on('click', self.params.zoomSelector, function (event) {
                event.preventDefault();

                self.stop();
                self.zoom();
            });

            self.on('click', self.params.playSelector, function (event) {
                event.preventDefault();

                self.play();
            });

            self.on('figure:stop', self.stop.bind(self));

            self.on('figure:getCollection', function (event, data) {
                self.call(data.callback, self.getCollectionData());
            });

            return self;
        },

        getInitialState: function () {
            var self = this;

            return {
                item: self.getItemData()
            };
        },

        init: function () {
            var self = this;

            if ($.depotHash.has(self.state.item.id)) {
                self.zoom();
            }

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotFigure = function (settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotFigure', new DepotFigure(container, settings));
        });
    };

    $.depotProto.$DOCUMENT.on('figure:added', function (event, settings) {
        var $target = $(event.target);
        var $figure;

        if ($target.is('.js-figure')) {
            $figure = $target;
        } else {
            $figure = $target.find('.js-figure');
        }

        if ($figure && $figure.length) {
            $figure.depotFigure(settings);
        }
    });
}(jQuery));

/**
 * @name depotForm
 * @version 5.0.0~
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotForm.git
 * @license MIT
 * (change) переименовал параметр `modificators` -> `modifiers`
 * (add) добавил метод update()
 * (add) добавил метод clearField(element)
 * (add) добавил возможность пробросить заголовок к запросу через параметр `requestHeaders` [{name,value}]
 * (fix) заменил new RegExp -> regexp
 * (fix) поправил сброску формы
 */

(function ($) {
    'use strict';

    function DepotForm(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotForm.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotForm',

        defaults: {
            fields: 'input:not([type="hidden"]), textarea, select',
            fieldSelector: '.js-form-field',
            fieldErrorSelector: '.js-form-field-error',
            submitButtonSelector: '.js-form-submit, [type="submit"]',
            busyClassName: 'is-busy',
            validClassName: 'is-valid',
            invalidClassName: 'is-invalid',
            processingClassName: 'is-processing',
            preventBadSubmit: true,
            preventRepeatedSubmit: true,
            ajax: false,
            dataType: 'json',
            processData: null,
            validation: true,
            validatorClassNamePrefix: 'is-',
            forceValidation: false,
            changeDebounce: 100,
            requestHeaders: [],
            validators: {
                'is-required': {
                    test: function (element, value, trimmedValue) {
                        return trimmedValue && Boolean(trimmedValue.length);
                    },
                    messagePath: 'errors.required'
                },

                'is-string': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        return !hasValue || /^([a-zа-яё.'" -]{1,256})$/ig.test(trimmedValue);
                    },
                    messagePath: 'errors.value'
                },

                'is-number': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && !!trimmedValue.length;
                        return !hasValue || /^([0-9-]{1,256})$/ig.test(value);
                    },
                    messagePath: 'errors.number'
                },

                'is-email': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        return !hasValue || /^[a-z0-9](['_.-a-z0-9]+)[@]([a-z0-9]+)([.-a-z0-9]+)+[.]([a-z]{2,})$/i.test(value);
                    },
                    messagePath: 'errors.email'
                },

                'is-tel': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        var cleanValue = trimmedValue.replace(/[^0-9+]/g, '');
                        var hasWrong = trimmedValue.replace(/[0-9() +-]/g, '') !== '';
                        var hasRepeats = /([() +-]+)\1+/g.test(trimmedValue);
                        var correctLength = /^[+]?[0-9]{7,}$/i.test(cleanValue);

                        return !hasValue || (!hasWrong && !hasRepeats && correctLength);
                    },
                    messagePath: 'errors.tel'
                },

                'is-date': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        var result = false;

                        var cleanValue = trimmedValue.replace(/[^0-9.]/g, '');
                        var parts = cleanValue.match(/^([0-3][0-9])\.([0-1][0-9])\.([1-2][09][0-9]{2})$/);

                        if (parts && parts.length === 4) {
                            var day = parseInt(parts[1], 10);
                            var month = parseInt(parts[2], 10) - 1;
                            var year = parseInt(parts[3], 10);

                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                var date = new Date(year, month, day) || false;
                                var currentYear = new Date().getFullYear();
                                result = day === date.getDate() && month === date.getMonth() && year === date.getFullYear() && year >= currentYear - 100 && year <= currentYear + 100;
                            }
                        }

                        return !hasValue || Boolean(result);
                    },
                    messagePath: 'errors.value'
                },

                'is-message': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        var minLength = element.minLength && element.minLength !== -1 ? element.minLength : 0;
                        var maxLength = element.maxLength && element.maxLength !== -1 ? element.maxLength : '';
                        var regExp = new RegExp('^(.{' + minLength + ',' + maxLength + '})', 'g');
                        return !hasValue || regExp.test(trimmedValue);
                    },
                    messagePath: 'errors.message'
                },

                'is-password': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        return !hasValue || /^([^а-яё ])/ig.test(trimmedValue);
                    },
                    messagePath: 'errors.password'
                },

                'is-minlength': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        return !hasValue || trimmedValue.length >= element.minLength;
                    },
                    messagePath: 'errors.minlength'
                },

                'is-maxlength': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        return !hasValue || trimmedValue.length <= element.maxLength;
                    },
                    messagePath: 'errors.maxlength'
                },

                'is-same': {
                    test: function (element, value, trimmedValue) {
                        var self = this;
                        var result = false;
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        var sameSlugMatches = element.className.match(/is-same:([^ ]+)/);
                        var sameSlug = sameSlugMatches ? sameSlugMatches[0] : undefined;

                        if (sameSlug) {
                            if (!self.state.same[sameSlug]) {
                                self.state.same[sameSlug] = {
                                    elements: [],
                                    name: undefined,
                                    isSame: true
                                };
                            }

                            var hasElement = false;
                            $.each(self.state.same[sameSlug].elements, function (i, sameElement) {
                                if (element.name === sameElement.name) {
                                    hasElement = true;
                                }

                                return !hasElement;
                            });

                            if (!hasElement) {
                                self.state.same[sameSlug].elements.push(element);

                                if (self.state.same[sameSlug].name === undefined) {
                                    self.state.same[sameSlug].name = self.state.same[sameSlug].elements[0].name;
                                    self.state.same[sameSlug].value = self.state.same[sameSlug].elements[0].value;
                                }
                            }

                            if (self.state.same[sameSlug].elements.length > 1) {

                                if (self.state.same[sameSlug].name === element.name) {
                                    self.state.same[sameSlug].value = value;
                                    result = true;

                                    $.each(self.state.same[sameSlug].elements, function (i, sameElement) {
                                        if (i) {
                                            self.validateField(sameElement);
                                        }
                                    });
                                } else {
                                    result = self.state.same[sameSlug].value === value;
                                }
                            }
                        }

                        return !hasValue || result;
                    },
                    messagePath: 'errors.match'
                },

                'is-external': {
                    test: function (element, value, trimmedValue) {
                        var hasValue = trimmedValue && Boolean(trimmedValue.length);
                        var externalArray = $.data(element, 'external') || [];
                        var cleanValue = value.replace(/[^a-zа-яё0-9]/ig, '');

                        return !hasValue || externalArray.indexOf(cleanValue) === -1;
                    }
                },

                'is-select': {
                    test: function (element, value, trimmedValue) {
                        return trimmedValue !== '' && trimmedValue !== '0' && trimmedValue !== '-1';
                    },
                    messagePath: 'errors.choose'
                },

                'is-checked': {
                    test: function (element, value, trimmedValue) {
                        var self = this;
                        self.state.choose = self.state.choose || {};
                        var $elements = self.$container.find(self.params.fields).filter('[name="' + element.name + '"]');

                        return $elements && !!$elements.filter(':checked').length;
                    },
                    messagePath: 'errors.choose'
                }

            },
            formatters: {
                'to-date': {
                    patterns: ['([0-9]{2})', '([0-9]{2})'],
                    separators: ['.', '.'],
                    permitted: '0-9\.'
                },
                'to-time': {
                    patterns: ['([0-9]{2})'],
                    separators: [':'],
                    permitted: '0-9:'
                },
                'to-card': {
                    patterns: ['([0-9]{4})', '([0-9]{5})', '([0-9]{4})'],
                    separators: [' ', ' '],
                    permitted: '0-9 '
                },
                'to-tel': {
                    patterns: ['([+]?)', '([0-9])', '([0-9]{3})', '([0-9]{3})', '([0-9]{2})'],
                    separators: ['', ' (', ') ', '-', '-'],
                    permitted: '0-9+)(-'
                }
            },
            modifiers: {
                'to-upper': function (event, element, selectionStart, valueHead, valueTail) {
                    var key = event.key;
                    var isOverLength = element.maxLength && element.value.length >= element.maxLength;
                    if (key.length && (isOverLength ? element.selectionStart !== element.selectionEnd : true)) {
                        element.value = (valueHead + key + valueTail).toUpperCase();
                        element.selectionStart = selectionStart + 1;
                        element.selectionEnd = element.selectionStart;
                    } else {
                        element.selectionStart = selectionStart;
                        element.selectionEnd = selectionStart;
                    }
                },
                'to-number': function (event, element, selectionStart, valueHead, valueTail) {
                    var re = /[^0-9-.,]/g;
                    var key = event.key.replace(re, '');
                    var isOverLength = element.maxLength !== -1 && element.value.length >= element.maxLength;
                    if (key.length && (isOverLength ? element.selectionStart !== element.selectionEnd : true)) {
                        element.value = (valueHead + key + valueTail).replace(re, '');
                        element.selectionStart = selectionStart + 1;
                        element.selectionEnd = element.selectionStart;
                    } else {
                        element.selectionStart = selectionStart;
                        element.selectionEnd = selectionStart;
                    }
                },
                'to-phone': function (event, element, selectionStart, valueHead, valueTail) {
                    var re = /[^0-9( )+-]/g;
                    var key = event.key.replace(re, '');
                    var isOverLength = element.maxLength && element.value.length >= element.maxLength;
                    if (key.length && (isOverLength ? element.selectionStart !== element.selectionEnd : true)) {
                        element.value = (valueHead + key + valueTail).replace(re, '');
                        element.selectionStart = selectionStart + 1;
                        element.selectionEnd = element.selectionStart;
                    } else {
                        element.selectionStart = selectionStart;
                        element.selectionEnd = selectionStart;
                    }
                }
            },
            dictionary: {
                errors: {
                    required: {
                        'ru': 'Обязательное поле',
                        'en': 'Required'
                    },
                    value: {
                        'ru': 'Недопустимое значение',
                        'en': 'Invalid value'
                    },
                    email: {
                        'ru': 'Некорректный e-mail',
                        'en': 'Invalid e-mail'
                    },
                    number: {
                        'ru': 'Только числа',
                        'en': 'Only numbers'
                    },
                    tel: {
                        'ru': 'Некорректный формат номера',
                        'en': 'Incorrect number format'
                    },
                    message: {
                        'ru': 'Сообщение слишком короткое',
                        'en': 'The message is too short'
                    },
                    password: {
                        'ru': 'Пароль должен содержать латинские буквы, символы и цифры',
                        'en': 'Password must contain latin letters, symbols and numbers'
                    },
                    minlength: {
                        'ru': 'Минимум ${minLength} ${minLength|plural(символ,символа,символов)}',
                        'en': 'Minimum length ${minLength} ${minLength|plural(character,characters)}'
                    },
                    maxlength: {
                        'ru': 'Максимум ${maxLength} ${maxLength|plural(символ,символа,символов)}',
                        'en': 'Maximum length ${maxLength} ${minLength|plural(character,characters)}'
                    },
                    choose: {
                        'ru': 'Необходимо выбрать',
                        'en': 'Choose'
                    },
                    match: {
                        'ru': 'Поля должны совпадать',
                        'en': 'Fields must match'
                    }
                }
            },
            onChangeSubmit: false,
            onChange: null,
            onSubmit: null,
            onReset: null,
            onError: null,
            onProgress: null,
            onValidation: null
        },

        normalizeFieldName: function (name) {
            return name && name.replace(/[\[\]]/ig, '-') || name;
        },

        filterArray: function (array, filter) {
            var filteredArray = [];
            if (Array.prototype.filter) {
                filteredArray = array.filter(filter);
            } else {
                $.each(array, function (i, element) {
                    if (filter(element, i, array)) {
                        filteredArray.push(element);
                    }
                });
            }

            return filteredArray;
        },

        startProcessingForm: function () {
            var self = this;

            self.state.processing = true;
            self.$container.addClass(self.params.processingClassName);

            return self;
        },

        stopProcessingForm: function () {
            var self = this;

            self.state.processing = false;
            self.$container.removeClass(self.params.processingClassName);

            return self;
        },

        storeFields: function () {
            var self = this;

            self.state.fields = self.state.fields || {};

            self.$container.find(self.params.fields).each(function (i, element) {
                self.addField(element);
            });

            return self;
        },

        addField: function (element) {
            var self = this;

            if (element && element.id && self.state.fields && !self.state.fields[element.id]) {
                self.state.fields[element.id] = {
                    canValidate: false,
                    changed: self.isChangedField(element),
                    busy: self.isBusyField(element)
                };
            }

            return self;
        },

        removeField: function (element) {
            var self = this;

            if (element && element.id) {
                if (self.state.fields && !self.state.fields[element.id]) {
                    delete self.state.fields[element.id];
                }
                if (self.state.errors && !self.state.errors[element.id]) {
                    delete self.state.errors[element.id];
                }
            }

            return self;
        },

        switchValidation: function (element) {
            var self = this;

            var hashedField = self.state.fields[element.id];

            if (hashedField && hashedField.changed) {
                hashedField.canValidate = true;
            }

            return self;
        },

        checkFieldChanges: function (element) {
            var self = this;

            var hashedField = self.state.fields[element.id];

            if (hashedField && !hashedField.changed && self.isChangedField(element)) {
                hashedField.changed = true;
                self.removeExternalErrorFor(element);
            }

            return self;
        },

        busyField: function (element) {
            var self = this;
            var hashedField = self.state.fields[element.id];

            if (hashedField) {
                hashedField.busy = true;

                self.delay(function () {
                    if (hashedField.busy === true) {
                        var $element = $(element);
                        var $field = $element.closest(self.params.fieldSelector);

                        $field.addClass(self.params.busyClassName);
                    }
                });
            }

            return self;
        },

        freeField: function (element, force) {
            var self = this;
            var hashedField = self.state.fields[element.id];

            if (hashedField) {
                hashedField.busy = false;

                self.delay(function () {
                    if (hashedField.busy === false || force) {
                        var $element = $(element);
                        var $field = $element.closest(self.params.fieldSelector);

                        $field.removeClass(self.params.busyClassName);
                    }
                });
            }

            return self;
        },

        isMultipart: function () {
            return this.container.enctype && this.container.enctype.toLocaleLowerCase() === 'multipart/form-data';
        },

        isBusyField: function (element) {
            var isSelect = element.type.indexOf('select') !== -1;
            return (!isSelect && element.value.length > 0) || (isSelect && element.value !== '0' && element.value !== '-1' && element.value !== '');
        },

        isChangedField: function (element) {
            var isSelect = element.type.indexOf('select') !== -1;
            var isCheckbox = element.type === 'checkbox';
            var isRadio = element.type === 'radio';
            var isChanged;

            if (isSelect) {
                isChanged = element.value !== '0' && element.value !== '-1' && element.value !== '';
            } else if (isCheckbox || isRadio) {
                isChanged = element.checked !== element.defaultChecked;
            } else {
                isChanged = element.value !== element.defaultValue;
            }

            return isChanged;
        },

        updateBusynessField: function (element) {
            var self = this;

            if (self.isBusyField(element)) {
                self.busyField(element);
            } else {
                self.freeField(element);
            }

            return self;
        },

        updateBusynessForm: function () {
            var self = this;

            self.$container.find(self.params.fields).each(function () {
                self.updateBusynessField(this);
            });

            return self;
        },

        validateForm: function () {
            var self = this;

            self.$container.find(self.params.fields).each(function () {
                self.validateField(this);
            });

            self.checkSubmit();

            self.call(self.params.onValidation, self.state.errors);

            return self;
        },

        validateField: function (element) {
            var self = this;
            var isValid = true;

            if (self.params.validators) {
                var $element = $(element);
                var className = (element.required ? self.params.validatorClassNamePrefix + 'required ' : '') + element.className;
                var elementClassList = className.trim().split(/[ ]+/) || [];
                if (elementClassList.length) {
                    var $field = $element.closest(self.params.fieldSelector);
                    var field = self.state.fields[element.id];

                    elementClassList = self.filterArray(elementClassList, function (element) {
                        return element.indexOf(self.params.validatorClassNamePrefix) === 0;
                    });

                    $.each(elementClassList, function (i, validatorClassName) {
                        var validator = self.params.validators[validatorClassName.replace(/:(.*)/, '')];

                        if (validator) {
                            if (typeof validator.test === 'function') {
                                var value = element.value;
                                var trimmedValue = value.trim();

                                if (self.call(validator.test, element, value, trimmedValue) || element.disabled) {
                                    self.removeErrorFor(element, validatorClassName);
                                } else {
                                    isValid = false;
                                    self.setErrorFor(element, validatorClassName, validator.message, validator.messagePath);
                                }
                            }
                        } else if (validatorClassName.indexOf(self.params.validatorClassNamePrefix + 'external-') === 0) {
                            var dataArray = $.data(element, 'external') || [];

                            if (dataArray.length) {
                                var message = $.data(element, 'message');
                                var cleanValue = element.value.replace(/[^a-zа-яё0-9]/ig, '');
                                if (dataArray.indexOf(cleanValue) === -1 || element.disabled) {
                                    self.removeExternalErrorFor(element);
                                } else {
                                    isValid = false;
                                    self.setExternalErrorFor(element, message);
                                }
                            }
                        }
                    });

                    if (isValid && field && field.canValidate && field.changed && field.busy) {
                        $field.addClass(self.params.validClassName);
                    } else {
                        $field.removeClass(self.params.validClassName);
                    }
                }
            }

            return isValid;
        },

        setExternalErrorFor: function (element, errorMessage) {
            var self = this;

            if (element) {
                var errorCode = self.params.validatorClassNamePrefix + 'external-' + self.normalizeFieldName(element.name);
                var dataArray = $.data(element, 'external') || [];
                var cleanValue = element.value.replace(/[^a-zа-яё0-9]/ig, '');

                if (dataArray.indexOf(cleanValue) === -1) {
                    dataArray.push(cleanValue);
                    $.data(element, 'external', dataArray);
                    $.data(element, 'message', errorMessage);
                }

                self.setErrorFor(element, errorCode, errorMessage);
            }

            return self;
        },

        removeExternalErrorFor: function (element) {
            var self = this;

            var errorCode = self.params.validatorClassNamePrefix + 'external-' + self.normalizeFieldName(element.name);

            self.removeErrorFor(element, errorCode);

            return self;
        },

        setErrorFor: function (element, errorCode, errorMessage, errorMessagePath) {
            var self = this;

            if (element) {
                var fieldId = element.id;
                var validationFieldId = fieldId.split(':')[0];

                if (!self.state.errors[validationFieldId]) {
                    self.state.errors[validationFieldId] = [];
                }

                if (self.state.errors[validationFieldId].indexOf(errorCode) === -1) {
                    self.state.errors[validationFieldId].push(errorCode);
                }

                if ((self.state.fields[fieldId] && self.state.fields[fieldId].canValidate) || self.state.submitted) {
                    self.showErrorMessage(element, errorCode, errorMessage, errorMessagePath);

                    if (typeof element.willValidate !== 'undefined' && element.willValidate === true) {
                        element.setCustomValidity(self.getValidatorMessage(errorMessage, errorMessagePath, element));
                    }
                } else {
                    self.hideErrorMessage(element, errorCode, errorMessage, errorMessagePath);
                }
            }

            return self;
        },

        removeErrorFor: function (element, errorCode) {
            var self = this;

            if (element) {
                var fieldId = element.id;
                var validationFieldId = fieldId.split(':')[0];

                if (self.state.errors[validationFieldId]) {

                    var externalErrorCode = errorCode + '-' + self.normalizeFieldName(element.name);

                    var errorIndex = self.state.errors[validationFieldId].indexOf(errorCode);
                    var externalIndex = self.state.errors[validationFieldId].indexOf(externalErrorCode);

                    if (errorIndex !== -1) {
                        self.state.errors[validationFieldId].splice(errorIndex, 1);
                    }

                    if (externalIndex !== -1) {
                        self.state.errors[validationFieldId].splice(externalIndex, 1);
                    }

                    if (!self.state.errors[validationFieldId].length) {
                        self.removeErrorsFor(element);

                        if (typeof element.willValidate !== 'undefined') {
                            element.setCustomValidity('');
                        }
                    }
                }
            }

            return self;
        },

        removeErrorsFor: function (element, force) {
            var self = this;

            if (element) {
                var fieldId = element.id;
                var validationFieldId = fieldId.split(':')[0];

                if (self.state.errors[validationFieldId] || force) {
                    delete self.state.errors[validationFieldId];

                    self.hideErrorMessage(element);
                }
            }

            return self;
        },

        showErrorMessage: function (element, errorCode, errorMessage, errorMessagePath) {
            var self = this;

            if (element) {
                self.delay(function () {
                    var $element = $(element);
                    var $field = $element.closest(self.params.fieldSelector);
                    var $fieldError = $field.find(self.params.fieldErrorSelector);

                    $field.removeClass(self.params.validClassName);
                    $field.addClass(self.params.invalidClassName);
                    $element.trigger(self.addEventNS('invalid'));

                    if ($fieldError && $fieldError.length) {
                        var validatorMessage = self.getValidatorMessage(errorMessage, errorMessagePath, element);

                        if (validatorMessage) {
                            $field.attr('title', validatorMessage);
                            $fieldError.text(validatorMessage);
                            $fieldError.aria('hidden', 'false');
                        }
                    }

                    $element.aria('invalid', 'true');
                    $element.aria('describedby', $fieldError.attr('id'));
                });
            }

            return self;
        },

        hideErrorMessage: function (element) {
            var self = this;

            if (element) {
                self.delay(function () {
                    var $element = $(element);
                    var $field = $element.closest(self.params.fieldSelector);
                    var $fieldError = $field.find(self.params.fieldErrorSelector);

                    $field.removeClass(self.params.invalidClassName);
                    $field.removeAttr('title');
                    $element.aria('invalid', 'false');
                    $element.removeAria('describedby');
                    $fieldError.text('');
                    $fieldError.aria('hidden', 'true');
                });
            }

            return self;
        },

        calculateErrors: function () {
            var self = this;
            var quantity = 0;

            $.each(self.state.errors, function (i, errors) {
                if (errors && errors.length) {
                    quantity += errors.length;
                }
            });

            return quantity;
        },

        getValidatorMessage: function (message, messagePath, element) {
            var self = this;
            var messageText = message;

            if (!messageText || !messageText.length && messagePath) {
                messageText = self.format(self.getText(messagePath), element);
            }

            return messageText;
        },

        checkSubmit: function () {
            var self = this;

            if (self.params.preventBadSubmit) {
                if (self.calculateErrors()) {
                    self.state.submitDisabled = true;
                    self.$submitButton.prop('disabled', true);
                } else {
                    self.state.submitDisabled = false;
                    self.$submitButton.prop('disabled', false);
                }
            }

            return self;
        },

        getSelectionRange: function (element, isRange) {
            var elementType = element.type;
            var begin = 0;
            var end = 0;
            var selection;
            if (['text', 'search', 'url', 'tel', 'email', 'password'].indexOf(elementType) !== -1) {
                if (typeof element.selectionStart === 'number') {
                    begin = element.selectionStart;
                    end = element.selectionEnd;
                } else {
                    var range = document.selection.createRange();
                    var inputRange = element.createTextRange(),
                        endRange = element.createTextRange(),
                        length = element.value.length;
                    inputRange.moveToBookmark(range.getBookmark());
                    endRange.collapse(false);
                    if (inputRange.compareEndPoints('StartToEnd', endRange) > -1) {
                        begin = length;
                        end = length;
                    } else {
                        begin = -inputRange.moveStart('character', -length);
                        end = -inputRange.moveEnd('character', -length);
                    }
                }
            }
            if (isRange) {
                selection = {
                    begin: begin,
                    end: end
                };
            } else {
                selection = begin;
            }
            return selection;
        },

        setSelection: function (element, selection) {
            var acceptedTypes = ['text', 'search', 'URL', 'tel', 'password'];
            if (typeof element.setSelectionRange === 'function' && acceptedTypes.indexOf(element.type) !== -1) {
                element.focus();
                element.setSelectionRange(selection.begin, selection.end);
            } else if (typeof element.createTextRange === 'function') {
                var range = element.createTextRange();
                range.collapse(true);
                range.moveEnd('character', selection.begin);
                range.moveStart('character', selection.end);
                range.select();
            }
        },

        getCursorPosition: function (element) {
            var self = this;

            return self.getSelectionRange(element, false);
        },

        setCursorPosition: function (element, position) {
            var self = this;

            return self.setSelection(element, {begin: position, end: position});
        },

        maskField: function (event, element) {
            var self = this;
            if (self.params.formatters) {
                var hotKey = event.ctrlKey || event.shiftKey || event.metaKey || event.altKey;
                if (!hotKey && [8, 9, 16, 35, 36, 37, 38, 39, 40, 46].indexOf(event.which) === -1) {
                    if (element.className && element.className.length) {
                        var elementClassList = element.className.split(' ');
                        $.each(self.params.formatters, function (formattersClassName, formatter) {
                            var continueEach = true;
                            if (elementClassList.indexOf(formattersClassName) !== -1) {
                                if (formatter && formatter.patterns && formatter.separators) {
                                    var cursor;
                                    var cursorAtEnd;

                                    if (event.which) {
                                        cursor = self.getCursorPosition(element);
                                        cursorAtEnd = cursor === element.value.length;
                                    }

                                    self.formatField(element, formatter.patterns, formatter.separators, formatter.permitted);

                                    if (event.which) {
                                        if (!cursorAtEnd) {
                                            self.setCursorPosition(element, cursor);
                                        } else {
                                            self.setCursorPosition(element, element.value.length);
                                        }
                                    }
                                }
                            }
                            return continueEach;
                        });
                    }
                }
            }

            return self;
        },

        formatField: function (element, patterns, separators, permitted) {
            var self = this;
            var value = element.value;
            var formatted = value;
            var separatorsChars = '';
            $.each(separators.join('').split(''), function (i, separatorsChar) {
                if (separatorsChars.indexOf(separatorsChar) === -1) {
                    separatorsChars += separatorsChar;
                }
            });
            separatorsChars = separatorsChars.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            var cleanValue = value.replace(new RegExp('[' + separatorsChars + ']', 'ig'), '');
            if (permitted) {
                cleanValue = cleanValue.replace(new RegExp('[^' + permitted + ']', 'ig'), '');
            }
            var pattern = '';
            var replacement = '$1';

            $.each(patterns, function (i) {
                var currentPattern = patterns[i] || '';
                var currentSeparator = separators[i] || '';
                pattern += currentPattern;
                var currentRegExp = new RegExp(pattern, 'i');
                if (currentRegExp.test(cleanValue)) {
                    formatted = cleanValue.replace(currentRegExp, replacement + currentSeparator);
                    if (element.value !== formatted) {
                        element.value = formatted;
                        $(element).trigger(self.addEventNS('masked'));
                    }
                }
                var nextI = i + 2;
                replacement += currentSeparator + '$' + nextI;
            });
        },

        modifyField: function (event, element) {
            var self = this;

            if (self.params.modifiers) {
                if (!event.ctrlKey && !event.metaKey && event.key && event.key.length === 1) {
                    $.each(self.params.modifiers, function (modificatorClassName, modificator) {
                        var continueEach = true;
                        if (element.className && element.className.length) {
                            if (element.className.split(' ').indexOf(modificatorClassName) !== -1) {
                                if (modificator && typeof modificator === 'function') {
                                    event.preventDefault();
                                    var selectionStart = Math.min(element.selectionStart, element.selectionEnd);
                                    var valueHead = element.value.substr(0, element.selectionStart);
                                    var valueTail = element.value.substr(element.selectionEnd, element.value.length);
                                    self.call(modificator, event, element, selectionStart, valueHead, valueTail);
                                }
                            }
                        }
                        return continueEach;
                    });
                }
            }

            return self;
        },

        deleteFormData: function () {
            var self = this;

            return delete self.state.formData;
        },

        getFormData: function (normalize) {
            var self = this;

            var formData = self.call(self.params.processData);

            if (!formData) {
                if (self.isMultipart()) {
                    formData = new FormData(self.container);
                    if (normalize) {
                        formData = $.depotParse(formData, {
                            reverse: true
                        });
                    }
                } else {
                    formData = self.$container.serialize();
                }
            }

            return formData;
        },

        submit: function (event) {
            var self = this;

            if (!self.state.processing) {
                self.state.submitted = true;

                self.startProcessingForm();

                if (self.params.validation) {
                    self.state.validation = true;
                    self.validateForm();
                }

                if (self.params.validation && self.calculateErrors()) {
                    if (event && typeof event.preventDefault === 'function') {
                        event.preventDefault();
                    }
                    self.stopProcessingForm();
                } else {
                    if (typeof self.params.onSubmit === 'function') {
                        var formData = self.getFormData();

                        if (self.params.preventRepeatedSubmit && self.state.formData === formData) {
                            if (self.params.ajax && event && typeof event.preventDefault === 'function') {
                                event.preventDefault();
                            }

                            self.stopProcessingForm();
                            self.call(self.params.onSubmit, self.state.response);
                        } else {
                            self.state.formData = formData;
                            if (self.params.ajax) {
                                if (event && typeof event.preventDefault === 'function') {
                                    event.preventDefault();
                                }

                                var multipartParams = {
                                    processData: false,
                                    contentType: false
                                };

                                $.ajax($.extend(true, self.isMultipart() ? multipartParams : {}, {
                                    url: self.$container.attr('action') || '',
                                    type: self.$container.attr('method') || 'GET',
                                    data: formData,
                                    dataType: self.params.dataType,
                                    cache: self.params.cache,
                                    xhr: function () {
                                        var xhr = $.ajaxSettings.xhr();
                                        if (xhr.upload) {
                                            xhr.upload.addEventListener('progress', function (progressEvent) {
                                                self.call(self.params.onProgress, progressEvent);
                                            }, true);
                                        }
                                        return xhr;
                                    },
                                    beforeSend: function (xhr) {
                                        if (self.params.requestHeaders.length) {
                                            self.params.requestHeaders.forEach(function (header) {
                                                xhr.setRequestHeader(header.name, header.value);
                                            });
                                        }
                                    },
                                    success: function (response, textStatus, request) {
                                        self.stopProcessingForm();
                                        self.state.response = response;
                                        self.call(self.params.onSubmit, response, textStatus, request);
                                    },
                                    error: function (jqXHR, textStatus, errorThrown) {
                                        self.stopProcessingForm();
                                        self.deleteFormData();
                                        self.call(self.params.onError, jqXHR, textStatus, errorThrown);
                                        self.error({
                                            action: 'DepotForm.submit',
                                            data: {
                                                url: self.container.action || '',
                                                type: self.container.method || 'GET',
                                                data: formData
                                            },
                                            name: textStatus,
                                            number: jqXHR.status,
                                            message: errorThrown
                                        });
                                    }
                                }));
                            } else {
                                self.call(self.params.onSubmit, event);
                                self.stopProcessingForm();
                            }
                        }
                    } else {
                        self.nativeSubmit();
                    }
                }
            }

            return self;
        },

        reset: function (event) {
            var self = this;

            if (event) {
                event.preventDefault();
            }

            self.$container.find(self.params.fields).each(function (i, element) {
                $(element).trigger('reset');
            });

            self.state = self.getInitialState();

            self.delay(function () {
                self.storeFields();
                self.validateForm();
            }, 0);

            if (event && typeof event === 'object' && event.type === 'reset') {
                self.call(self.params.onReset, event);
            }

            return self;
        },

        resetField: function (element) {
            var self = this;
            var $element = $(element);

            if ($element.is('select')) {
                $element.find('option').each(function (i, option) {
                    self.delay(function () {
                        option.selected = option.defaultSelected;
                    });
                });
            } else if ($element.is('[type="radio"]') || $element.is('[type="checkbox"]')) {
                element.checked = element.defaultChecked;
            } else {
                element.value = element.defaultValue;
            }

            self.state.fields[element.id] = {
                canValidate: false,
                changed: self.isChangedField(element),
                busy: self.isBusyField(element)
            };

            return self;
        },

        clearField: function (element) {
            var self = this;
            var $element = $(element);

            if ($element.is('select')) {
                $element.find('option').each(function (i, option) {
                    option.selected = i === 0;
                    option.defaultSelected = false;
                });
            } else if ($element.is('[type="radio"]') || $element.is('[type="checkbox"]')) {
                element.checked = false;
                element.defaultChecked = false;
            } else {
                element.value = '';
                element.defaultValue = '';
            }

            return self;
        },

        update: function () {
            var self = this;

            self.updateBusynessForm();
            self.validateForm();

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.nativeSubmit = self.container.submit.bind(self.container);
            self.nativeReset = self.container.reset.bind(self.container);

            self.container.submit = self.submit.bind(self);
            self.container.reset = self.reset.bind(self);

            self.on('focusout', self.params.fields, function () {
                var element = this;
                var fieldId = element.id;

                self.throttle(['focusout', fieldId].join('-'), function () {
                    self.switchValidation(element);

                    if (self.params.validation) {
                        self.validateField(element);
                    }
                });
            });

            self.on('keypress', self.params.fields, function (event) {
                self.modifyField(event, this);
            });

            self.on('keyup', self.params.fields, function (event) {
                var element = this;
                var fieldId = element.id;

                self.throttle([event.type, fieldId].join('-'), function () {
                    self.maskField(event, element);
                }, self.params.changeDebounce);
            });

            self.on('change input keyup invalid update', self.params.fields, function (event) {
                var element = this;
                var fieldId = element.id;

                self.throttle([event.type, fieldId].join('-'), function () {
                    self.updateBusynessField(element);
                    self.checkFieldChanges(element);

                    if (self.params.validation) {
                        self.validateField(element);
                        self.checkSubmit();
                    }
                }, self.params.changeDebounce);

                self.throttle(['onChange', fieldId].join('-'), function () {
                    self.call(self.params.onChange, event, element);
                });

                if (self.params.onChangeSubmit) {
                    self.submit();
                }
            });

            self.on('submit', function (event) {
                if (self.state.processing) {
                    event.preventDefault();
                } else {
                    self.submit(event);
                }
            });

            self.on('reset', self.params.fields, function (event) {
                var element = event.target;
                event.stopPropagation();

                self.freeField(element, true);
                self.removeErrorsFor(element, true);
                self.resetField(element);
                self.validateField(element);

                self.checkSubmit();
            });

            self.on('clear', self.params.fields, function (event) {
                var element = event.target;
                event.stopPropagation();

                self.freeField(element, true);
                self.removeErrorsFor(element, true);
                self.clearField(element);
                self.validateField(element);
            });

            self.on('reset', function (event) {
                self.reset(event);
            });

            self.on('error', function (event) {
                self.call(self.params.onError, event.data.error);
            });

            self.$container.on('form:update', function () {
                self.throttle('form:update', function () {
                    self.update();
                });
            });

            return self;
        },

        getInitialState: function () {
            var self = this;

            var requestHeaders = Array.prototype.concat(self.params.requestHeaders || []);

            return {
                fields: {},
                errors: {},
                same: {},
                submitted: false,
                submitDisabled: false,
                validation: self.params.forceValidation,
                requestHeaders: requestHeaders
            };
        },

        init: function () {
            var self = this;

            self.storeFields();

            self.$submitButton.prop('disabled', Boolean(self.params.preventBadSubmit));
            self.$container.prop('novalidate', Boolean(self.params.validation));

            self.updateBusynessForm();
            self.validateForm();

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotForm = function (settings) {
        return this.each(function (i, container) {
            $.data(container, 'depotForm', new DepotForm(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function DepotGallery(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotGallery.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotGallery',

        defaults: {
            viewportSelector: '.js-gallery-viewport',
            listSelector: '.js-gallery-list',
            itemsSelector: '.js-gallery-item',
            navigationSelector: '.js-gallery-navigation',
            clonedClassName: 'is-cloned',
            transitionClassName: 'is-transition',
            slowTransitionClassName: 'is-slow-transition',
            ratio: 460 / 700,
            startFrom: 0,
            swipe: true,
            swipeThreshold: 30,
            loop: true,
            beforeChange: null,
            onChange: null,
            onTransitionEnd: null
        },

        getInitialState: function () {
            var self = this;
            var items = [];

            self.$items.each(function (index, item) {
                var $item = $(item);
                var itemData = $(item).data() || {};
                $item.attr('data-index', index + 1);
                items.push($.extend(true, itemData, {
                    index: index + 1,
                    item: item
                }));
            });

            return {
                items: items,
                $current: null,
                current: null,
                currentDOMIndex: 0,
                currentRealIndex: 1,
                direction: 0,
                isTransition: false,
                itemsQuantity: self.$items.length,
                preventClick: false,
                transitionDelay: null
            };
        },

        onTransitionEnd: function () {
            var self = this;
            var $slice;

            self.cancelDelay(self.state.transitionDelay);

            var delta = Math.abs(self.state.direction);

            self.$list.removeClass(self.params.transitionClassName);
            self.$list.removeClass(self.params.slowTransitionClassName);
            self.state.isTransition = false;
            self.state.preventClick = false;

            self.state.$current.attr('tabindex', '0');

            if (self.state.direction > 0) {
                $slice = self.$items.slice(0, self.state.direction);
                self.$list.append($slice);
                self.state.currentDOMIndex -= delta;
                self.$items = self.$list.find(self.params.itemsSelector);
                self.moveListTo(self.$list, self.state.$current, self.state, true);
            } else if (self.state.direction < 0) {
                $slice = self.$items.slice(self.state.direction);
                self.$list.prepend($slice);
                self.state.currentDOMIndex += delta;
                self.$items = self.$list.find(self.params.itemsSelector);
                self.moveListTo(self.$list, self.state.$current, self.state, true);
            }

            self.call(self.params.onTransitionEnd);

            return self;
        },

        moveListToPositionLeft: function ($list, positionLeft, state, force) {
            var self = this;

            if (!force) {
                state.isTransition = true;

                state.transitionDelay = self.delay(function () {
                    $list.trigger('transitionend');
                }, 3000);

                if (Math.abs(state.direction) > 1) {
                    $list.addClass(self.params.slowTransitionClassName);
                } else {
                    $list.addClass(self.params.transitionClassName);
                }
            }

            var transforms = self.cleanObject();
            transforms[Modernizr.prefixedCSS('transform')] = Modernizr.prefixedCSSValue('transform', 'translateX(' + positionLeft + 'px)');

            $list.css(transforms);

            return self;
        },

        getItemPosition: function ($item) {
            return $item.position().left * -1;
        },

        moveListTo: function ($list, $current, state, force) {
            var self = this;
            var positionLeft = self.getItemPosition($current);

            self.moveListToPositionLeft($list, positionLeft, state, force);

            return self;
        },

        getClosestDOMIndex: function (realIndex) {
            var self = this;
            var $targetItem = self.state.$current;

            if (realIndex > self.state.currentRealIndex) {
                $targetItem = self.state.$current.nextAll('[data-index="' + realIndex + '"]');
            } else if (realIndex < self.state.currentRealIndex) {
                $targetItem = self.state.$current.prevAll('[data-index="' + realIndex + '"]');
            }

            return $targetItem.index();
        },

        goTo: function (DOMIndex, force) {
            var self = this;
            var $target = self.$items.eq(DOMIndex);
            var targetRealIndex = $target.data('index');

            if (targetRealIndex === self.state.currentRealIndex && !force) {
                return self;
            }

            self.state.preventClick = !force;

            if ($target.length && !self.state.isTransition) {
                self.call(self.params.beforeChange, DOMIndex, force);

                if (self.state.$current && self.state.$current.length) {
                    self.state.$current.aria('current', 'false');
                    self.state.$current.attr('tabindex', '-1');
                    self.state.$current.find('.js-figure').trigger('figure:stop');
                }

                $target.aria('current', 'true');

                $target.find('[loading="lazy"]').trigger('lazy:load');

                self.state.current = $target.get(0);
                self.state.$current = $target;
                self.state.direction = DOMIndex - self.state.currentDOMIndex;
                self.state.currentDOMIndex = DOMIndex;
                self.state.currentRealIndex = $target.data('index');

                self.moveListTo(self.$list, $target, self.state, force);
                self.call(self.params.onChange, DOMIndex, force);
            }

            return self;
        },

        goForwards: function () {
            var self = this;
            var nextIndex = self.state.currentDOMIndex + 1;

            return self.goTo(nextIndex);
        },

        goBackwards: function () {
            var self = this;
            var nextIndex = self.state.currentDOMIndex - 1;

            return self.goTo(nextIndex);
        },

        loop: function () {
            var self = this;

            function addLazyLoading(i, img) {
                $(img).attr('loading', 'lazy');
            }

            var $firstClonedItems = self.$items.clone().addClass(self.params.clonedClassName);
            var $lastClonedItems = self.$items.clone().addClass(self.params.clonedClassName);

            $firstClonedItems.find('img').each(addLazyLoading);
            $lastClonedItems.find('img').each(addLazyLoading);

            self.$list.prepend($firstClonedItems);
            self.$list.append($lastClonedItems);

            $firstClonedItems.trigger('lazy:added').trigger('figure:added');
            $lastClonedItems.trigger('lazy:added').trigger('figure:added');

            self.getElements();

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.on('transitionend', self.params.listSelector, function (event) {
                event.stopPropagation();
                if ($(event.target).is(self.params.listSelector)) {
                    self.onTransitionEnd();
                }
            });

            self.on('click', self.params.itemsSelector, function (event) {
                var $targetItem = $(this);
                var DOMIndex = $targetItem.index();

                if (self.state.currentDOMIndex !== DOMIndex && !self.state.preventClick) {
                    event.preventDefault();
                    event.stopPropagation();

                    self.throttle('goTo', function () {
                        self.goTo(DOMIndex);
                    });
                }
            });

            self.on('keydown', function (event) {
                switch (event.which) {
                    case self.KEYS.ARROW_LEFT:
                        event.preventDefault();
                        self.throttle('forwards', self.goForwards);
                        break;
                    case self.KEYS.ARROW_RIGHT:
                        event.preventDefault();
                        self.throttle('backwards', self.goBackwards);
                        break;
                }
            });

            self.bind('resize', self.$WINDOW, function () {
                self.throttle('resize', function () {
                    self.goTo(self.state.currentDOMIndex, true);
                }, 15);
            });

            if (self.params.swipe) {
                if (self.hasPlugin('depotSwipe')) {
                    self.$viewport.depotSwipe({
                        targetSelector: self.params.listSelector,
                        touchThreshold: self.params.swipeThreshold,
                        mouse: true,
                        onStart: function (event) {
                            event.preventDefault();
                            self.state.preventClick = true;
                        },
                        onMove: function (event, swipe) {
                            event.preventDefault();

                            var force = true;
                            var currentPosition = self.getItemPosition(self.state.$current);
                            var delta = swipe.current.left - swipe.start.left;

                            if (delta !== 0) {
                                self.moveListToPositionLeft(self.$list, currentPosition + delta, self.state, force);
                            }
                        },
                        onEnd: function (event, swipe) {
                            event.preventDefault();
                            event.stopPropagation();

                            if (swipe.delta > 0) {
                                self.goBackwards();
                            } else {
                                self.goForwards();
                            }
                        },
                        onCancel: function (event, swipe) {
                            if (swipe.delta !== 0) {
                                var force = true;
                                self.state.direction = 0;
                                self.state.preventClick = true;

                                self.moveListToPositionLeft(self.$list, self.getItemPosition(self.state.$current), self.state, force);
                            } else {
                                self.state.preventClick = false;
                            }
                        }
                    });
                }
            }

            return self;
        },

        init: function () {
            var self = this;

            if (self.params.loop) {
                self.loop();
                self.params.startFrom += self.state.itemsQuantity;
            }

            self.goTo(self.params.startFrom, true);

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotGallery = function (settings) {
        return this.each(function (i, container) {
            $.data(container, 'depotGallery', new DepotGallery(container, settings));
        });
    };
}(jQuery));

/**
 * @name depotHash ~
 * @version 1.6.0
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotHash.git
 * @license MIT
 * @changes:
 * (fix) Поправил добавление хеша
 * (add) Добавил метод `create(hashSource)` Конвертирует источник в строку, добавляет `#!` в начало и возвращает её
 * (add) Добавил метод `replaceMatchedCompile(re, value, save)` Находит и заменяет значение параметра подходящего под регулярку
 * (add) Добавил метод `toObject(hashString)` Конвертирует строку хеша в объект
 */

(function ($) {
    'use strict';
    var CACHE_ARRAY = {};
    var CACHE_OBJECT = {};
    var CALLBACKS = [];

    function _clearHash(hash) {
        return hash ? hash.replace(/^[#]?[!]?/, '') : hash;
    }

    function _fromArray(array) {
        return array ? array.sort().join('&') : '';
    }

    function _fromObject(object) {
        return object ? _fromArray(Object.keys(object).reduce(function (result, key) {
            var value = object[key];
            var current = value === true ? key : key + '=' + value;
            if (Array.isArray(value)) {
                current = value.map(function (currentValue) {
                    return key + '=' + currentValue;
                });
            }
            return Array.prototype.concat(result, current);
        }, [])) : '';
    }

    function DepotHash() {
        var hash = this;

        window.addEventListener('hashchange', function (event) {
            function call(callback) {
                callback.call(null, event);
            }

            CALLBACKS.forEach(call);
        }, false);

        return hash;
    }

    DepotHash.prototype = {
        onChange: function (callback) {
            if (typeof callback === 'function') {
                CALLBACKS.push(callback);
            }

            return this;
        },

        offChange: function (callback) {
            var indexOfCallback = CALLBACKS.indexOf(callback);

            if (indexOfCallback !== -1) {
                CALLBACKS.splice(indexOfCallback, 1);
            }

            return this;
        },

        /**
         * Возвращает хеш строку
         * @param {Object|String} [target = window.location.hash] целевой объект (строка)
         * @return {String} хеш строка
         */
        get: function (target) {
            var hash;

            if (target) {
                if (target.hash) {
                    hash = _clearHash(target.hash);
                } else if (typeof target === 'string') {
                    hash = _clearHash(target);
                }
            } else if (target === undefined) {
                hash = _clearHash(window.location.hash);
            }

            return hash;
        },

        /**
         * Конвертирует источник в строку, добавляет `#!` в начало и возвращает её
         * @param {String|Array.<String>|Object} hashSource Исходная строка (объект, массив строк) хеша
         * @return {String} хеш строка
         */
        create: function (hashSource) {
            var hash = '#!';

            if (typeof hashSource === 'string' || typeof hashSource === 'number') {
                hash += hashSource;
            } else if (Array.isArray(hashSource)) {
                hash += _fromArray(hashSource);
            } else if (typeof hashSource === 'object') {
                hash += _fromObject(hashSource);
            }

            return hash;
        },

        /**
         * Устанавливает хеш строку, заменяя старую
         * @param {String|Array.<String>|Object} hashSource новая хеш строка
         * @param {Boolean} [save=false] тригирить ли событие hashchange
         * @return {String} хеш строка
         */
        set: function (hashSource, save) {
            var hash = this.create(hashSource);

            if (hash !== window.location.hash) {
                if (save) {
                    window.location.hash = hash;
                } else {
                    var currentLocation = window.location.toString().split('#')[0];
                    var newLocation = currentLocation + hash;
                    window.location.replace(newLocation);
                }
            }

            return hash;
        },

        /**
         * Добавляет хеш значение
         * @param {String|Array.<String>|Object} hashSource новая хеш строка
         * @param {Boolean} [save=false] тригирить ли событие hashchange
         * @return {String} хеш строка
         */
        add: function (hashSource, save) {
            var targetObject = this.toObject();
            var hashObject = this.toObject(hashSource);

            Object.keys(hashObject).forEach(function (key) {
                targetObject[key] = hashObject[key];
            });

            return this.set(targetObject, save);
        },

        /**
         * Заменяет старое значение на новое
         * @param {String} oldHash старое хеш значение
         * @param {String} newHash новое хеш значение
         * @param {Boolean} [save=false] тригирить ли событие hashchange
         * @return {String|Boolean} хеш строка или false если старое значение не найдено
         */
        replace: function (oldHash, newHash, save) {
            var oldIndex = this.indexOf(oldHash);
            var newIndex = this.indexOf(newHash);

            if (oldIndex !== -1 && newIndex === -1) {
                var hashArray = this.toArray();

                hashArray[oldIndex] = newHash;

                return this.set(hashArray, save);
            } else if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                return this.remove(oldHash, save);
            } else if (oldIndex === -1 && newIndex === -1) {
                return this.add(newHash, save);
            }

            return false;
        },

        /**
         * Удаляет хеш значение из строки браузера
         * @param {String} hash искомое хеш значение
         * @param {Boolean} [save=false] тригирить ли событие hashchange
         */
        remove: function (hash, save) {
            var index = this.indexOf(hash);

            if (index !== -1) {
                var hashArray = this.toArray();

                hashArray.splice(index, 1);

                return this.set(hashArray, save);
            }

            return false;
        },

        /**
         * Очищает хеш строки браузера
         * @param {Boolean} [save=false] тригирить ли событие hashchange
         */
        clear: function (save) {
            return this.set('', save);
        },

        /**
         * Конвертирует строку хеша в массив
         * @param {String} [currentHash = location.hash] строка для конвертации
         */
        toArray: function (currentHash) {
            var hashArray = [];
            currentHash = currentHash || this.get();

            if (currentHash) {
                if (CACHE_ARRAY[currentHash]) {
                    hashArray = CACHE_ARRAY[currentHash];
                } else {
                    currentHash.split('&').forEach(function (hash) {
                        if (hashArray.indexOf(hash) === -1) {
                            hashArray = hashArray.concat([hash]);
                        }
                    });
                    CACHE_ARRAY[currentHash] = hashArray;
                }
            }

            return hashArray.concat();
        },

        /**
         * Конвертирует исходный хеш в объект
         * @param {String|Array.<String>|Object} [currentHash = location.hash] currentHash источник для конвертации
         */
        toObject: function (currentHash) {
            var hashObject = {};
            currentHash = currentHash || this.get();

            if (Array.isArray(currentHash)) {
                currentHash = _fromArray(currentHash);
            }

            if (typeof currentHash === 'string' || typeof currentHash === 'number') {
                if (CACHE_OBJECT[currentHash]) {
                    hashObject = CACHE_OBJECT[currentHash];
                } else {
                    currentHash.split('&').sort().forEach(function (hash) {
                        var keyValue = hash.split('=');
                        var key = keyValue[0];
                        var value = keyValue[1];

                        if (key !== '') {
                            if (hashObject[key] === undefined) {
                                hashObject[key] = value === undefined ? true : value;
                            } else {
                                var sourceValuesArray = Array.prototype.concat(hashObject[key]);
                                if (sourceValuesArray.indexOf(value) === -1) {
                                    hashObject[key] = Array.prototype.concat(sourceValuesArray, value);
                                }
                            }
                        }
                    });
                    CACHE_OBJECT[currentHash] = hashObject;
                }
            } else if (typeof currentHash === 'object') {
                hashObject = currentHash;
            }

            return $.extend(null, hashObject);
        },

        indexOf: function (hash) {
            var hashArray = this.toArray();
            return hash !== undefined && hashArray.length ? hashArray.indexOf(hash.toString()) : -1;
        },

        has: function (hash) {
            return hash instanceof RegExp ? !!this.getMatched(hash).length : this.indexOf(hash) !== -1;
        },

        /**
         * Находит и заменяет значение параметра подходящего под регулярку
         * @param {RegExp} re Регулярка для поиска
         * @param {String} value Новое значение
         * @param {Boolean} [save=false] тригирить ли событие hashchange
         */
        replaceMatchedCompile: function (re, value, save) {
            var hashArray = this.toArray();
            var replaced = false;

            function compileMatched(hash) {
                if (re.test(hash)) {
                    replaced = true;
                    return hash.replace(re, function (sourceHash, sourceValue) {
                        return sourceHash.replace(sourceValue, value);
                    });
                } else {
                    re.toString().replace(re, value);
                }

                return hash;
            }

            return this.set(hashArray.map(compileMatched), save);
        },

        /**
         * @name getMatchedCallback
         * @function
         * @param {String} value Текущий параметр хеша
         * @param {Array} matches Найденные подстроки
         */
        /**
         * Выполняет коллбэк функцию для всех найденных вхождений по регулярке
         * @param {RegExp} re Регулярка для поиска
         * @param {getMatchedCallback} [callback] Функция обратного вызова, вызывается для каждого параметра хеша
         */
        getMatched: function (re, callback) {
            var hashArray = this.toArray();
            var matched = [];

            function addMatched(value) {
                var matches = value.match(re);
                if (matches && value.length) {
                    matched.push(value);
                    if (typeof callback === 'function') {
                        callback.call(null, value, matches);
                    }
                }
            }

            hashArray.forEach(addMatched);

            return matched;
        },

        removeMatched: function (re, save) {
            var hashArray = this.toArray();
            var notMatched = [];

            function rmMatched(value) {
                if (!re.test(value) && value.length) {
                    notMatched.push(value);
                }
            }

            hashArray.forEach(rmMatched);

            return this.set(notMatched, save);
        },

        replaceMatched: function (re, hash, save) {
            var hashArray = this.toArray();
            var notMatched = [];

            function rmMatched(value) {
                if (!re.test(value) && value.length) {
                    notMatched.push(value);
                }
            }

            hashArray.forEach(rmMatched);

            if (hash !== undefined && hash.length) {
                notMatched.push(hash);
            }

            return this.set(notMatched, save);
        }
    };

    $.depotHash = new DepotHash();
}(jQuery));

(function ($) {
    'use strict';

    function DepotLazy(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotLazy.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotLazy',

        defaults: {
            headerSelector: '.js-header',
            rootMargin: {
                top: 500,
                left: 300,
                right: 300,
                bottom: 500
            }
        },

        hasIntersectionObserver: function () {
            var hasIntersectionObserver = false;

            if ('IntersectionObserver' in window &&
                'IntersectionObserverEntry' in window &&
                'intersectionRatio' in window.IntersectionObserverEntry.prototype) {

                if (!('isIntersecting' in window.IntersectionObserverEntry.prototype)) {
                    Object.defineProperty(window.IntersectionObserverEntry.prototype,
                        'isIntersecting', {
                            get: function () {
                                return this.intersectionRatio > 0;
                            }
                        });
                }

                hasIntersectionObserver = true;
            }

            return hasIntersectionObserver;
        },

        onload: function () {
            var self = this;

            self.$container.trigger('lazy:done');
            self.unbindEvents();

            return self;
        },

        onerror: function () {
            var self = this;

            self.unbindEvents();

            return self;
        },

        initLoad: function (image) {
            var imageData = $(image).data();
            var self = imageData.depotLazy;

            self.unbindEvents();

            if (imageData && imageData.src) {
                image.onload = function (event) {
                    if (self.observer) {
                        self.observer.unobserve(image);
                    }

                    return self.onload(image, event);
                };

                image.onerror = function (event) {
                    if (self.observer) {
                        self.observer.unobserve(image);
                    }

                    return self.onerror(image, event);
                };

                if (imageData.srcset) {
                    image.srcset = imageData.srcset;
                }

                $.data(image, 'thumb', image.src);
                image.loading = 'eager';
                image.src = imageData.src;
            } else if (self.observer) {
                self.observer.unobserve(image);
            }

            return self;
        },

        getViewport: function () {
            var self = this;
            var headerHeight = 0;

            if (self.$header.length) {
                headerHeight = parseFloat(self.$header.outerHeight());
            }

            var containerTop = Math.round(self.$container.offset().top);
            var containerLeft = Math.round(self.$container.offset().left);
            var containerBottom = Math.round(containerTop + self.$container.outerHeight(true));
            var containerRight = Math.round(containerLeft + self.$container.outerWidth(true));

            var windowTop = self.$WINDOW.scrollTop() - self.params.rootMargin.top;
            var windowBottom = windowTop + self.$WINDOW.innerHeight() + self.params.rootMargin.bottom;
            var windowLeft = self.$WINDOW.scrollLeft() - self.params.rootMargin.left;
            var windowRight = windowLeft + self.$WINDOW.innerWidth() + self.params.rootMargin.right;

            return {
                headerHeight: headerHeight,
                containerTop: containerTop,
                containerRight: containerRight,
                containerBottom: containerBottom,
                containerLeft: containerLeft,
                windowTop: windowTop,
                windowRight: windowRight,
                windowBottom: windowBottom,
                windowLeft: windowLeft
            };
        },

        updateViewport: function () {
            var self = this;

            self.state.viewport = self.getViewport();

            return self;
        },

        inViewport: function () {
            var self = this;

            var isAbove = self.state.viewport.containerBottom < self.state.viewport.windowTop;
            var isUnder = self.state.viewport.containerTop > self.state.viewport.windowBottom;
            var isLeft = self.state.viewport.containerLeft < self.state.viewport.windowLeft;
            var isRight = self.state.viewport.containerRight > self.state.viewport.windowRight;
            var isHidden = !self.isCSSVisible(self.image);

            return !(isAbove || isUnder || isLeft || isRight || isHidden);
        },

        isCSSVisible: function (image) {
            return window.getComputedStyle(image).visibility === 'visible';
        },

        getObserver: function () {
            var self = this;

            var config = {
                rootMargin: self.format('${top}px ${right}px ${bottom}px ${left}px', self.params.rootMargin),
                threshold: 0
            };

            window.lazyObserver = new window.IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting || entry.intersectionRatio > 0) {
                        if (self.isCSSVisible(entry.target)) {
                            self.initLoad(entry.target);
                        } else {
                            self.delay(function () {
                                if (self.isCSSVisible(entry.target)) {
                                    self.initLoad(entry.target);
                                }
                            }, 300);
                        }
                    }
                });
            }, config);

            return window.lazyObserver;
        },

        initObserver: function () {
            var self = this;

            self.observer = window.lazyObserver || self.getObserver();
            self.observer.observe(self.image);

            return self;
        },

        bindEvents: function () {
            var self = this;

            if (self.hasIntersectionObserver()) {
                self.initObserver();
            } else {
                self.bind('load scroll resize lazy:check', self.$WINDOW, function () {
                    self.updateViewport();
                    if (self.inViewport()) {
                        self.initLoad(self.image);
                    }
                });
            }

            self.one('lazy:load', function () {
                self.initLoad(self.image);
            });

            return self;
        },

        getInitialState: function () {
            var self = this;
            self.image = self.container;

            return {
                viewport: self.getViewport()
            };
        },

        init: function () {
            var self = this;
            self.$header = $(self.params.headerSelector);

            self.delay(function () {
                self.triggerTo(self.$WINDOW, 'lazy:check');
            });

            return self;
        }
    });

    $.fn.depotLazy = function (settings) {
        function isLazy(image) {
            return !!$(image).data('src');
        }

        return this.each(function (i, container) {
            if (isLazy(container)) {
                $.data(container, 'depotLazy', new DepotLazy(container, settings));
            }
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function DepotLevel(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotLevel.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotLevel',

        defaults: {
            itemsSelector: '.js-level-item',
            toggleSelector: '.js-level-toggle',
            deepSelector: '.js-level-deep'
        },

        getInitialState: function () {
            return {};
        },

        isOpen: function ($toggle) {
            return $toggle.aria('expanded') === 'true';
        },

        close: function ($toggle, $deep) {
            var self = this;

            $toggle.aria('expanded', 'false');
            $deep.attr('hidden', true);

            $deep.find(self.params.toggleSelector).trigger('level:close');

            self.unbind('click', self.$DOCUMENT);

            return self;
        },

        open: function ($toggle, $deep) {
            var self = this;

            $toggle.aria('expanded', 'true');
            $deep.attr('hidden', false);

            self.bind('click', self.$DOCUMENT, function (event) {
                if (!$(event.target).closest($deep.get(0)).length) {
                    self.close($toggle, $deep);
                }
            });

            return self;
        },

        toggle: function ($toggle, $deep) {
            var self = this;

            if (self.isOpen($toggle)) {
                self.close($toggle, $deep);
            } else {
                self.open($toggle, $deep);
            }

            return self;
        },

        getItems: function ($toggle) {
            var self = this;

            var $item = $toggle.closest(self.params.itemsSelector);
            var $deep = $item.find(self.format('${selector}[aria-labelledby="${id}"]', {
                selector: self.params.deepSelector,
                id: $toggle.attr('id')
            }));

            return {
                $item: $item,
                $toggle: $toggle,
                $deep: $deep
            };
        },

        bindEvents: function () {
            var self = this;

            self.on('click', self.params.toggleSelector, function (event) {
                event.preventDefault();
                event.stopPropagation();

                var elements = self.getItems($(this));

                self.throttle('toggle', function () {
                    self.toggle(elements.$toggle, elements.$deep);
                });
            });

            self.on('level:close', self.params.toggleSelector, function (event) {
                event.preventDefault();
                event.stopPropagation();

                var elements = self.getItems($(this));

                self.throttle('close', function () {
                    self.close(elements.$toggle, elements.$deep);
                });
            });

            self.on('level:open', self.params.toggleSelector, function (event) {
                event.preventDefault();
                event.stopPropagation();

                var elements = self.getItems($(this));

                self.throttle('open', function () {
                    self.open(elements.$toggle, elements.$deep);
                });
            });

            return self;
        },

        init: function () {
            var self = this;

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotLevel = function (settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotLevel', new DepotLevel(container, settings));
        });
    };
}(jQuery));

/**
 * @name depotLoaderMore ~
 * @version 4.0.0
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotLoaderMore.git
 * @license MIT
 */
(function ($) {
    'use strict';

    function DepotLoaderMore(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotLoaderMore.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotLoaderMore',

        defaults: {
            buttonSelector: '.js-load-more-button',
            targetSelector: '.js-load-more-here',
            processingClassName: 'is-processing',
            lastSelector: '.is-last',
            method: 'GET',
            dataType: 'html',
            dataParam: 'base',
            pageParam: 'page',
            inheritGetParams: true,
            onSuccess: null,
            onError: null
        },

        getSearch: function getSearch(source) {
            var search;

            if (source) {
                if (typeof source === 'object') {
                    search = source.search;
                } else if (typeof source === 'string') {
                    search = source;
                }
            } else {
                search = window.location.search;
            }

            var searchMatches = search && search.match(/^[?](.*)/);


            return searchMatches && searchMatches.length ? searchMatches[1] : '';
        },

        checkButton: function () {
            var self = this;

            if (self.params.dataType === 'html' && self.$target.find(self.params.lastSelector).length) {
                self.$button.detach();
            }

            return self;
        },

        loadMore: function (paramsObject) {
            var self = this;

            if (!self.state.busy) {
                self.startProcess();

                var requestParams = self.cleanObject();

                if (self.params.inheritGetParams) {
                    self.state.get = $.depotParse(window.location.search);

                    requestParams = $.extend(true, self.state.get, paramsObject);
                } else if (paramsObject) {
                    requestParams = paramsObject;
                }

                self.state.request = $.ajax({
                    url: self.cache.requestUrl,
                    type: self.params.method,
                    dataType: self.params.dataType,
                    data: requestParams,
                    success: function (response) {
                        self.stopProcess();

                        if (response) {
                            self.increasePage();

                            if (typeof self.params.onSuccess === 'function') {
                                self.call(self.params.onSuccess, response);
                            } else if (self.params.dataType === 'html') {
                                self.$target.append(response);
                            }

                            self.checkButton();
                        }
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        self.stopProcess();
                        self.error({
                            action: 'DepotLoaderMore.loadMore',
                            data: {
                                url: self.cache.requestUrl,
                                type: self.params.method,
                                data: requestParams,
                            },
                            name: textStatus,
                            number: jqXHR.status,
                            message: errorThrown
                        });

                        self.call(self.params.onError, jqXHR);
                    }
                });
            }

            return self;
        },

        increasePage: function () {
            var self = this;

            var button = self.$button.get(0);

            var buttonSearch = self.getSearch(button);
            var buttonParams = $.depotParse(buttonSearch);

            var currentPage = parseInt(buttonParams[self.params.pageParam]);

            if (!isNaN(currentPage)) {
                buttonParams[self.params.pageParam] = currentPage + 1;

                button.search = '?' + $.param(buttonParams, true);
            }

            return self;
        },

        startProcess: function () {
            var self = this;

            self.state.busy = true;
            self.$container.addClass(self.params.processingClassName).aria('busy', 'true');

            return self;
        },

        stopProcess: function () {
            var self = this;

            self.state.busy = false;
            self.$container.removeClass(self.params.processingClassName).aria('busy', 'false');

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('online', self.$WINDOW, function () {
                self.state.offline = false;
                self.$button.removeClass('is-disabled').prop('disabled', false);
            });

            self.bind('offline', self.$WINDOW, function () {
                self.state.offline = true;
                self.$button.addClass('is-disabled').prop('disabled', true);
            });

            self.$button.on('click', function (event) {
                event.preventDefault();
                var button = this;
                if (!self.state.offline) {
                    self.debounce('click', function () {
                        self.state.search = self.getSearch(button);

                        if (self.hasPlugin('depotParse')) {
                            var requestParams = $.depotParse(self.state.search);
                            self.loadMore(requestParams);
                        }
                    });
                } else if (self.hasPlugin('depotNotifications')) {
                    $.depotNotifications.warn({
                        ru: 'Проверьте подключение к сети.',
                        en: 'Check your network connection.'
                    });
                }
            });

            return self;
        },

        init: function () {
            var self = this;

            self.cache.requestUrl = self.$button.data(self.params.dataParam);

            self.call(self.params.onInit);

            return self;
        }

    });

    $.fn.depotLoaderMore = function (settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotLoaderMore', new DepotLoaderMore(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function DepotNotifications() {
        var self = this;

        self.$container = $('.js-notifications');

        // inline notifications
        self.$container.on('click', '.js-notification-close', function (event) {
            event.preventDefault();
            $(this).closest('.js-notification').attr('hidden', true);
        });
    }

    DepotNotifications.prototype = {
        template: '<div class="notification notification_default notification_${mod}" role="alert" hidden><div class="notification__container"><div class="notification__row"><div class="notification__text"><p>${text}</p></div><button class="notification__close js-notification-close" type="button" aria-label="${close}"></button></div></div></div>',
        timeout: 7500,
        minTimeout: 2500,
        maxTimeout: 60000,

        log: function (text, options) {
            var self = this;
            var mod = options && options.mod || 'log';
            var timeout = $.depotProto.clamp(self.minTimeout, options && options.timeout || self.timeout, self.maxTimeout);
            var context = options && options.context || {};
            var callback = options && options.callback || null;

            var $notification = $($.depotProto.format(self.template, {
                mod: mod,
                text: $.depotProto.format($.depotProto.translate(text), context),
                close: $.depotProto.translate({
                    ru: 'Закрыть',
                    en: 'Close'
                })
            }));

            self.$container.prepend($notification);

            $.depotProto.delay(function () {
                $notification.get(0).style.setProperty('--timeout', timeout + 'ms');
                $notification.attr('hidden', false);

                var hideCallback = function () {
                    $notification.on('animationend', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        $notification.remove();
                        if (typeof callback === 'function') {
                            callback.call(null);
                        }
                    });

                    $notification.attr('hidden', true);
                };
                var hideDelayId = $.depotProto.delay(hideCallback, timeout);

                $notification.on('click', '.js-notification-close', function (event) {
                    event.preventDefault();
                    $.depotProto.cancelDelay(hideDelayId);
                    hideCallback.call();
                });
            }, 100);
        },

        warn: function (text, options) {
            var self = this;

            if (window.navigator && typeof window.navigator.vibrate === 'function') {
                window.navigator.vibrate(200);
            }

            return self.log(text, $.extend(options, {
                mod: 'warning'
            }));
        },

        info: function (text, options) {
            var self = this;

            return self.log(text, $.extend(options, {
                mod: 'info'
            }));
        }
    };

    $.depotNotifications = new DepotNotifications();
}(jQuery));

(function ($) {
    'use strict';

    function DepotOverflow(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotOverflow.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotOverflow',

        defaults: {
            containerSelector: '.js-overflow',
            contentSelector: '.js-overflow-content',
            scrollbarSelector: '.js-overflow-scrollbar',
            thumbSelector: '.js-overflow-thumb',
            containerTemplate: '<div class="overflow ${containerSelector|substr(1)}"></div>',
            scrollbarTemplate: '<div class="overflow__scrollbar ${scrollbarSelector|substr(1)}">${thumbTemplate}</div>',
            thumbTemplate: '<div class="overflow__thumb ${thumbSelector|substr(1)}"></div>',
            contentClassName: 'overflow__content',
            overflowClassName: 'is-overflow'
        },

        swapContainer: function () {
            var self = this;

            self.$container.wrap(self.format(self.params.containerTemplate, self.params));
            self.$content = self.$container;
            self.$content.addClass(self.params.contentClassName);
            self.$container = self.$container.parent();
            self.container = self.$container.get(0);

            return self;
        },

        getInitialState: function () {
            var self = this;

            return {
                hasScrollbar: false,
                context: self.getContext(),
                scrollTop: 0,
                scrollbarScale: 1
            };
        },

        checkScrollbar: function () {
            var self = this;

            return self.$content.get(0).scrollHeight > self.$content.height();
        },

        getContext: function () {
            var self = this;

            return $.extend(true, self.cleanObject(self.params), {});
        },

        update: function () {
            var self = this;
            var hasScrollbar = self.checkScrollbar();

            if (hasScrollbar !== self.state.hasScrollbar) {
                // add || remove
                if (self.state.hasScrollbar) {
                    // remove
                    self.$container.removeClass(self.params.overflowClassName);
                } else {
                    //add
                    if (!self.$scrollbar.length) {
                        self.$container.append(self.format(self.params.scrollbarTemplate, self.state.context));
                        self.getElements(self.params);

                        self.$scrollbar.depotSwipe({
                            targetSelector: self.params.thumbSelector,
                            onStart: function (event, state) {
                                var scrollHeight = self.$content.get(0).scrollHeight;
                                var scrollbarHeight = self.$scrollbar.height();
                                self.state.scrollTop = self.$content.scrollTop();
                                self.state.scrollbarScale = scrollHeight / scrollbarHeight;
                            },
                            onMove: function (event, state) {
                                if (state.isActive) {
                                    var scrollTop = self.state.scrollTop;
                                    var swipeDeltaTop = (state.current.top - state.start.top) * self.state.scrollbarScale;

                                    self.$content.scrollTop(scrollTop + swipeDeltaTop);

                                    self.update();
                                }
                            }
                        });
                    }

                    self.$container.addClass(self.params.overflowClassName);
                }

                self.state.hasScrollbar = hasScrollbar;
            }

            // if isset change position
            if (self.state.hasScrollbar) {
                var height = self.$content.height();
                var scrollHeight = self.$content.get(0).scrollHeight;
                var scrollTop = self.$content.scrollTop();
                var thumbHeight = parseFloat((height / scrollHeight * 100).toFixed(6));
                var thumbTop = parseFloat((scrollTop / height * 100).toFixed(6));

                self.$thumb.css(self.prefixed({
                    height: thumbHeight + '%',
                    transform: 'translate3d(0,' + thumbTop + '%,0)'
                }));
            }
            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('click', self.$HTMLBODY, function () {
                self.delay(self.update);
            });

            self.on('wheel update', function () {
                self.update();
            });

            return self;
        },

        init: function () {
            var self = this;

            self.update();

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.extend({
        depotOverflow: function (settings) {
            return $(this).each(function (i, container) {
                $.data(this, 'depotOverflow', new DepotOverflow(container, settings));
            });
        }
    });
}(jQuery));

/**
 * @name depotParse~
 * @version 2.3.0
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotParse.git
 * @license MIT
 * @changes:
 * (change) Метод `parseObject` всегда возвращает тип `String`
 * (change) Метод `parseString` всегда возвращает тип `Object`
 * (rename) переименовал внутреннею переменную `pairsCount` на `pairsQuantity`
 */

(function ($) {
    'use strict';

    function getType(smth) {
        return Object.prototype.toString.call(smth).slice(8, -1).toLowerCase();
    }

    function parseObject(object, params) {
        var search = '';

        if (params.reverse) {
            var searchArray = [];
            $.each(object, function (key, value) {
                if (value === undefined) {
                    if (params.empty) {
                        searchArray.push(key);
                    }
                } else if (value instanceof Array) {
                    $.each(value, function (i, subValue) {
                        if (params.traditional) {
                            searchArray.push(key + params.assign + subValue);
                        } else {
                            searchArray.push(key + '[]' + params.assign + subValue);
                        }
                    });
                } else {
                    if (params.traditional) {
                        searchArray.push(key + params.assign + value);
                    } else {
                        $.each(value, function (subKey, subValue) {
                            searchArray.push(key + '[' + subKey + ']' + params.assign + subValue);
                        });
                    }
                }
            });

            if (params.encode) {
                search = encodeURI(searchArray.join(params.split));
            } else {
                search = searchArray.join(params.split);
            }
        }

        return search;
    }

    function parseString(search, params) {
        var object = null;

        if (search.length) {
            var searchStringPairs;
            if (search.indexOf('?') === 0) {
                searchStringPairs = search.substr(1).split(params.split);
            } else {
                searchStringPairs = search.split(params.split);
            }
            var pairsQuantity = searchStringPairs.length;
            if (pairsQuantity) {
                for (var i = 0; i < pairsQuantity; i += 1) {
                    var partsRe = new RegExp('([^' + params.assign + ']*)' + params.assign + '?(.*)', 'i');
                    var pairParts = searchStringPairs[i].match(partsRe);
                    if (pairParts && pairParts.length) {
                        var paramName = decodeURIComponent(pairParts[1]);
                        var paramValue = pairParts[2];
                        if (paramValue && !isNaN(paramValue)) {
                            paramValue = parseFloat(paramValue);
                        } else if (paramValue) {
                            paramValue = decodeURIComponent(paramValue.toString());
                        } else {
                            paramValue = undefined;
                        }

                        if (paramValue !== undefined || params.empty === true) {
                            if (paramName && paramName.length) {
                                object = object || {};
                                if (!object[paramName]) {
                                    object[paramName] = paramValue;
                                } else {
                                    if (object[paramName] instanceof Array) {
                                        if (params.merge === true) {
                                            if (object[paramName].indexOf(paramValue) === -1) {
                                                object[paramName].push(paramValue);
                                            }
                                        } else {
                                            object[paramName].push(paramValue);
                                        }
                                    } else {
                                        if (params.merge === true) {
                                            if (object[paramName] !== paramValue) {
                                                object[paramName] = [object[paramName], paramValue];
                                            }
                                        } else {
                                            object[paramName] = [object[paramName], paramValue];
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        return object;
    }

    function depotParse(search, options) {
        var params = $.extend(true, {
            merge: false,
            empty: true,
            split: '&',
            assign: '=',
            reverse: false,
            traditional: true,
            encode: false
        }, options);

        var object = null;

        if (getType(search) === 'object') {
            object = parseObject(search, params);
        } else if (getType(search) === 'string') {
            object = parseString(search, params);
        } else if (getType(search) === 'array') {
            $.each(search, function (i, searchItem) {
                object = $.extend(true, object, depotParse(searchItem, params));
            });
        }

        return object;
    }

    $.depotParse = depotParse;
}(jQuery));

/**
 * @name depotPopup~
 * @version 3.0.1
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotPopup.git
 * @license MIT
 * @changes:
 * (fix) Поправил работу с хешем
 * (add) Добавил параметр `beforeHide`
 */

(function ($) {
    'use strict';

    function DepotPopup(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotPopup.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotPopup',

        defaults: {
            buttonSelector: '.js-popup-toggle',
            bodySelector: '.js-popup-body',
            closeButtonSelector: '.js-popup-close',
            fieldsSelector: 'input:not([type="hidden"]), textarea, select',
            visibleClassName: 'is-visible',
            addBodyClass: 'is-cropped',
            hideDebounce: 300,
            resetScroll: false,
            mediaQuery: '',
            kickOff: true,
            useHash: true,
            hashRe: false,
            onHashChange: null,
            beforeShow: null,
            beforeHide: null,
            onShow: null,
            onHide: null,
            onToggle: null
        },

        getID: function () {
            return this.$container.attr('id');
        },

        onHashChange: function () {
            var self = this;

            var hasHash = $.depotHash.has(self.params.hashRe ? self.params.hashRe : self.state.hash);

            if (hasHash) {
                if (!self.state.isVisible) {
                    self.debounce('hashChange', self.show);
                }

                self.call(self.params.onHashChange);
            } else if (!hasHash && self.state.isVisible) {
                self.debounce('hashChange', self.hide);
                self.call(self.params.onHashChange);
            }

            return self;
        },

        preventShow: function () {
            var self = this;

            self.state.preventShow = true;

            return self;
        },

        startProcessing: function startProcessing() {
            var self = this;

            self.$body.addClass(self.params.processingClassName);

            return self;
        },

        stopProcessing: function stopProcessing() {
            var self = this;

            self.$body.removeClass(self.params.processingClassName);

            return self;
        },

        preventKickOff: function () {
            var self = this;

            if (self.params.hideDebounce) {
                self.state.hideDebounce = true;
                self.delay(function () {
                    delete self.state.hideDebounce;
                }, self.params.hideDebounce);
            }

            return self;
        },

        hide: function (event, data) {
            var self = this;

            if (self.state.isVisible) {
                self.call(self.params.beforeHide, event, data);
                self.state.isVisible = false;

                self.$container.removeClass(self.params.visibleClassName);
                self.$container.attr('hidden', true);
                self.$container.attr('tabindex', '-1');

                if (self.params.useHash) {
                    if (self.hasPlugin('depotHash')) {
                        if (self.params.hashRe) {
                            if ($.depotHash.has(self.params.hashRe)) {
                                $.depotHash.removeMatched(self.params.hashRe);
                            }
                        } else {
                            $.depotHash.remove(self.state.hash);
                        }
                    }
                }

                if (self.params.addBodyClass && !self.state.preventRemoveBodyClass) {
                    self.$BODY.removeClass(self.params.addBodyClass);
                    self.$WINDOW.trigger('resize');
                }

                self.$container.scrollTop(0);
                self.$container.scrollLeft(0);

                self.state = self.getInitialState();

                self.call(self.params.onHide, event, data);
            }

            return self;
        },

        show: function (event, data) {
            var self = this;

            if (!self.state.isVisible) {
                self.call(self.params.beforeShow, event, data);
                if (!self.state.preventShow) {
                    self.preventKickOff();

                    self.state.isVisible = true;

                    self.$container.addClass(self.params.visibleClassName);
                    self.$container.attr('hidden', false);
                    self.$container.attr('tabindex', '0');

                    if (self.params.useHash && self.hasPlugin('depotHash')) {
                        if (self.params.hashRe) {
                            if ($.depotHash.has(self.params.hashRe)) {
                                self.state.hash = $.depotHash.getMatched(self.params.hashRe)[0];
                            } else {
                                $.depotHash.add(self.state.hash);
                            }
                        } else if (!$.depotHash.has(self.state.hash)) {
                            $.depotHash.add(self.state.hash);
                        }
                    }

                    if (self.params.resetScroll) {
                        window.scrollTo(0, 0);
                    }

                    if (self.params.addBodyClass) {
                        self.delay(function () {
                            if (self.state.isVisible) {
                                if (self.$BODY.hasClass(self.params.addBodyClass)) {
                                    self.state.preventRemoveBodyClass = true;
                                } else {
                                    self.state.preventRemoveBodyClass = false;
                                    self.$BODY.addClass(self.params.addBodyClass);
                                }

                                self.$WINDOW.trigger('resize');
                            }
                        }, 10);
                        self.delay(function () {
                            if (self.state.isVisible) {
                                if (self.$fields.length) {
                                    self.$fields.get(0).focus();
                                } else {
                                    self.$container.get(0).focus();
                                }

                            }
                        }, 100);
                    }

                    self.call(self.params.onShow, event, data);
                } else {
                    self.state.preventShow = false;
                }
            }

            return self;
        },

        toggle: function () {
            var self = this;

            if (self.state.isVisible) {
                self.hide();
            } else {
                self.show();
            }

            self.call(self.params.onToggle);

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('click', self.$BODY, self.params.buttonSelector, function (event) {
                event.preventDefault();

                self.debounce('toggle', self.toggle);
            });

            self.on('click', self.params.closeButtonSelector, function (event) {
                event.preventDefault();

                self.debounce('close', self.hide);
            });

            self.on('popup:show', function (event, data) {
                self.debounce('show', function () {
                    self.show(event, data);
                });
            });

            self.on('popup:hide', function (event, data) {
                self.debounce('hide', function () {
                    self.hide(event, data);
                });
            });

            if (self.params.useHash) {
                if (self.hasPlugin('depotHash')) {
                    $.depotHash.onChange(function () {
                        self.onHashChange();
                    });
                }
            }

            if (self.params.kickOff) {
                self.bind('click', self.$BODY, function (event) {
                    if (!self.state.hideDebounce) {
                        if ($(event.target).closest('body').length && !$(event.target).closest(self.params.bodySelector).length && self.state.isVisible) {
                            self.hide();
                        }
                    }
                });
            }

            if (self.params.mediaQuery) {
                window.matchMedia(self.params.mediaQuery).onchange = function (event) {
                    if (self.state.isVisible && !event.matches) {
                        self.hide();
                    }
                };
            }

            self.bind('keyup', self.$BODY, function (event) {
                if (self.state.isVisible && event.which === self.KEYS.ESCAPE) {
                    event.preventDefault();

                    self.hide();
                }
            });

            return self;
        },

        getInitialState: function () {
            var self = this;
            var id = self.getID();
            var hash = id;

            if (self.params.useHash && self.hasPlugin('depotHash')) {
                if (self.params.hashRe && $.depotHash.has(self.params.hashRe)) {
                    hash = $.depotHash.getMatched(self.params.hashRe)[0] || hash;
                }
            }

            return {
                id: id,
                hash: hash,
                isVisible: false,
                hideDebounce: false,
                preventShow: false,
                preventRemoveBodyClass: false
            };
        },

        init: function () {
            var self = this;

            self.$fields = self.$container.find(self.params.fieldsSelector);

            if (self.params.useHash) {
                if (self.hasPlugin('depotHash')) {
                    if ($.depotHash.has(self.params.hashRe ? self.params.hashRe : self.state.hash)) {
                        self.show();
                    }
                }
            }

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotPopup = function (settings) {
        return this.each(function (i, container) {
            $.data(container, 'depotPopup', new DepotPopup(container, settings));
        });
    };
}(jQuery));

/**
 * @name depotStorage~
 * @version 1.2.1
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotStorage.git
 * @license MIT
 * @changes:
 * (fix) Подправил функцию `_getExpirationDate`
 */
(function ($) {
    'use strict';

    var CALLBACKS = [];
    var DEFAULTS = {
        type: 'local',
        path: '/'
    };

    function _encode(value) {
        var result;

        if (typeof value === 'object') {
            result = encodeURIComponent(JSON.stringify(value));
        } else {
            result = encodeURIComponent(value);
        }

        return result;
    }

    function _decode(value) {
        var decodedValue = decodeURIComponent(value);
        var result;

        try {
            result = JSON.parse(decodedValue);
        } catch (error) {
            if (decodedValue === 'NaN') {
                result = NaN;
            } else if (decodedValue !== 'undefined') {
                result = decodedValue;
            }
        }

        return result;
    }

    function _getMilliseconds(timeString) {
        var replaceResult = (timeString || '').toString().replace(/^([0-9.-]+)(Y|M|D|h|m|s|ms)$/, function (source, value, dimension) {
            var result = parseFloat(value);
            var timeFactor = 1;

            switch (dimension) {
                case 'Y':
                    timeFactor = 365 * 24 * 60 * 60 * 1000;
                    break;
                case 'M':
                    timeFactor = 30 * 24 * 60 * 60 * 1000;
                    break;
                case 'D':
                    timeFactor = 24 * 60 * 60 * 1000;
                    break;
                case 'h':
                    timeFactor = 60 * 60 * 1000;
                    break;
                case 'm':
                    timeFactor = 60 * 1000;
                    break;
                case 's':
                    timeFactor = 1000;
                    break;
                default:
                    timeFactor = 1;
            }

            return !isNaN(result) ? result * timeFactor : 0;
        });

        var floatResult = parseFloat(replaceResult);

        return !isNaN(floatResult) ? floatResult : 0;
    }

    function _getExpirationDate(timeString) {
        var dateTime = false;
        var ms = _getMilliseconds(timeString);

        if (ms) {
            dateTime = new Date();
            dateTime.setTime(dateTime.getTime() + ms);
        }

        return dateTime;
    }

    function _changeEvent(storage, type, name, originalEvent) {
        CALLBACKS.forEach(function (callback) {
            if (typeof callback === 'function') {
                callback.call(storage, type, name, originalEvent);
            }
        });
    }

    function _getDocumentCookies() {
        var cookies = $.depotProto.cleanObject();

        document.cookie.split(/\s?;\s?/).forEach(function (cookie) {
            var parts = cookie.match(/^([^=]+)=([^=;]+)$/);
            if (parts) {
                cookies[parts[1]] = parts[2];
            }
        });

        return cookies;
    }

    function DepotStorage() {
        var storage = this;

        $(window).on('storage.depotStorage', function (event) {
            _changeEvent(storage, 'local', event.originalEvent.key, event.originalEvent);
        });

        return storage;
    }


    DepotStorage.prototype = {
        onChange: function (callback) {
            if (typeof callback === 'function' && CALLBACKS.indexOf(callback) === -1) {
                CALLBACKS.push(callback);
            }
            return this;
        },

        offChange: function (callback) {
            if (typeof callback === 'function' && CALLBACKS.indexOf(callback) !== -1) {
                CALLBACKS.splice(CALLBACKS.indexOf(callback), 1);
            } else if (callback === 'all') {
                CALLBACKS = [];
            }

            return this;
        },

        setItem: function (name, value, options) {
            var storage = this;
            var success = false;

            var params = $.extend(true, {}, DEFAULTS, options);

            var stringValue = _encode(value);

            if (params.expires) {
                var expirationDate = _getExpirationDate(params.expires);
                params.expires = expirationDate ? expirationDate.toUTCString() : 0;
            }

            switch (params.type) {
                case 'cookie':
                    var cookie = name + '=' + stringValue;

                    if (params) {
                        Object.keys(params).forEach(function (param) {
                            var value = params[param];
                            if (param !== 'type') {
                                cookie += '; ' + param + '=' + value;
                            }
                        });
                    }

                    try {
                        document.cookie = cookie;
                        success = true;
                    } catch (error) {
                        console.error(error);
                    }

                    break;
                case 'session':
                    var session = _encode(
                        $.extend(true, params, {
                            value: stringValue
                        })
                    );

                    try {
                        sessionStorage.setItem(name, session);
                        success = true;
                    } catch (error) {
                        console.error(error);
                    }

                    break;
                default:
                    var local = _encode(
                        $.extend(true, params, {
                            value: stringValue
                        })
                    );

                    try {
                        localStorage.setItem(name, local);
                        success = true;
                    } catch (error) {
                        console.error(error);
                    }
            }

            _changeEvent(storage, params.type, name);

            return success;
        },

        getItem: function (name, type) {
            var storage = this;

            var item;

            if (typeof type === 'object') {
                type = type.type;
            }

            switch (type) {
                case 'cookie':
                    try {
                        var cookies = _getDocumentCookies();
                        if (cookies[name]) {
                            item = _decode(cookies[name]);
                        }
                    } catch (error) {
                        console.error(error);
                    }

                    break;
                case 'session':
                    try {
                        var sessionItem = _decode(sessionStorage.getItem(name));
                        if (sessionItem) {
                            if (typeof sessionItem === 'object') {
                                var sessionExpires = Date.parse(sessionItem.expires);
                                if (sessionExpires && sessionExpires < Date.now()) {
                                    storage.removeItem(name, type);
                                } else {
                                    item = _decode(sessionItem.value);
                                }
                            } else {
                                item = sessionItem;
                            }
                        }
                    } catch (error) {
                        console.error(error);
                    }

                    break;
                default:
                    try {
                        var localItem = _decode(localStorage.getItem(name));
                        if (localItem) {
                            if (typeof localItem === 'object') {
                                var localExpires = Date.parse(localItem.expires);
                                if (localExpires && localExpires < Date.now()) {
                                    storage.removeItem(name, type);
                                } else {
                                    item = _decode(localItem.value);
                                }
                            } else {
                                item = localItem;
                            }
                        }
                    } catch (error) {
                        console.error(error);
                    }
            }

            return item;
        },

        getItemMeta: function (name, type) {
            var meta;

            if (typeof type === 'object') {
                type = type.type;
            }

            switch (type) {
                case 'cookie':
                    break;
                case 'session':
                    try {
                        meta = _decode(sessionStorage.getItem(name));
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                default:
                    try {
                        meta = _decode(localStorage.getItem(name));
                    } catch (error) {
                        console.error(error);
                    }
            }

            return meta;
        },

        removeItem: function (name, type, options) {
            var storage = this;

            if (typeof type === 'object') {
                type = type.type;
                options = type;
            }

            switch (type) {
                case 'cookie':
                    try {
                        var params = {
                            type: type,
                            expires: '-1Y'
                        };
                        if (options && options.domain) {
                            params.domain = options.domain;
                        }
                        storage.setItem(name, null, params);
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                case 'session':
                    try {
                        sessionStorage.removeItem(name);
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                default:
                    try {
                        localStorage.removeItem(name);
                    } catch (error) {
                        console.error(error);
                    }
            }

            _changeEvent(storage, type, name);
        },

        removeMatched: function (re, type) {
            var storage = this;

            if (typeof type === 'object') {
                type = type.type;
            }

            switch (type) {
                case 'cookie':
                    try {
                        var cookies = _getDocumentCookies();
                        Object.keys(cookies).forEach(function (name) {
                            if (new RegExp(re, 'i').test(name)) {
                                storage.removeItem(name, type);
                            }
                        });
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                case 'session':
                    try {
                        Object.keys(sessionStorage).forEach(function (name) {
                            if (new RegExp(re, 'i').test(name)) {
                                sessionStorage.removeItem(name);
                            }
                        });
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                default:
                    try {
                        Object.keys(localStorage).forEach(function (name) {
                            if (new RegExp(re, 'i').test(name)) {
                                localStorage.removeItem(name);
                            }
                        });
                    } catch (error) {
                        console.error(error);
                    }
            }

            _changeEvent(storage, type);
        },

        clear: function (type) {
            var storage = this;

            switch (type) {
                case 'cookie':
                    try {
                        var cookies = _getDocumentCookies();
                        Object.keys(cookies).forEach(function (name) {
                            storage.removeItem(name, type);
                        });
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                case 'session':
                    try {
                        sessionStorage.clear();
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                default:
                    try {
                        localStorage.clear();
                    } catch (error) {
                        console.error(error);
                    }
            }

            _changeEvent(storage, type);
        }
    };

    if (!navigator.cookieEnabled) {
        $.depotNotifications.warn({
            ru: 'Для полной функциональности этого сайта необходимо включить файлы cookie.',
            en: 'For full functionality of this site it is necessary to enable cookies.'
        }, {
            timeout: 60000
        });
    }

    $.depotStorage = new DepotStorage();
}(jQuery));

/**
 * @name depotSwipe ~
 * @version 3.0.0
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotSwipe.git
 * @license MIT
 */
(function ($) {
    'use strict';

    var EVENTS_ALL = {
        START: {
            pointer: ['pointerdown'],
            touch: ['touchstart'],
            ms: ['mspointerdown'],
            mouse: ['mousedown']
        },
        MOVE: {
            pointer: ['pointermove'],
            touch: ['touchmove'],
            ms: ['mspointermove'],
            mouse: ['mousemove']
        },
        END: {
            pointer: ['pointerup'],
            touch: ['touchend'],
            ms: ['mspointerup'],
            mouse: ['mouseup']
        },
        CANCEL: {
            pointer: ['pointerleave', 'pointercancel'],
            touch: ['touchcancel'],
            ms: ['mspointercancel'],
            mouse: ['mouseleave']
        }
    };

    function hasEvent(eventType) {
        return 'on' + eventType in document.documentElement;
    }

    function DepotSwipe(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotSwipe.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotSwipe',

        defaults: {
            targetSelector: false,
            mouse: true,
            swipeThreshold: 30,
            onStart: null,
            onMove: null,
            onEnd: null,
            onCancel: null
        },

        getInitialState: function () {
            var self = this;

            return {
                EVENTS: self.detectEvents()
            };
        },


        detectEvents: function () {
            var self = this;
            var EVENTS = self.cleanObject();

            $.each(EVENTS_ALL, function (eventGroupName, eventGroup) {
                $.each(eventGroup, function (eventType, eventNameList) {
                    var goNext = true;
                    $.each(eventNameList, function (i, eventName) {
                        if (hasEvent(eventName)) {
                            goNext = false;
                            if (!EVENTS[eventGroupName]) {
                                EVENTS[eventGroupName] = [eventName];
                            } else {
                                EVENTS[eventGroupName].push(eventName);
                            }
                        }
                    });

                    return goNext;
                });
            });

            return EVENTS;
        },

        normalizePointer: function (event) {
            var self = this;
            var reMouse = new RegExp('pointer', 'i');
            var rePointer = new RegExp('pointer', 'i');
            var isTypeMouse = reMouse.test(event.originalEvent.type);
            var isTypePointer = rePointer.test(event.originalEvent.type);
            var left = event.pageX;
            var top = event.pageY;
            var isMouse = true;

            if (event.originalEvent && isTypePointer) {
                isMouse = event.pointerType === 'mouse';
                left = event.originalEvent.pageX;
                top = event.originalEvent.pageY;
            } else if (event.originalEvent && event.originalEvent.touches) {
                isMouse = false;
                if (event.originalEvent.touches.length) {
                    left = event.originalEvent.touches[0].pageX;
                    top = event.originalEvent.touches[0].pageY;
                }
            } else if (event.targetTouches) {
                isMouse = false;
                if (event.targetTouches.length) {
                    left = event.targetTouches[0].pageX;
                    top = event.targetTouches[0].pageY;
                }
            } else if (event.originalEvent && isTypeMouse && self.params.mouse) {
                left = event.originalEvent.pageX;
                top = event.originalEvent.pageY;
            }

            return {
                left: parseInt(left, 10),
                top: parseInt(top, 10),
                isMouse: isMouse
            };
        },

        getPosition: function () {
            var self = this;

            var elementParentOffset = self.$container.parent().offset();

            return {
                top: self.state.current.top - elementParentOffset.top,
                left: self.state.current.left - elementParentOffset.left
            };
        },

        getState: function () {
            var self = this;

            return self.cleanObject(self.state);
        },

        start: function (event) {
            var self = this;

            if (!self.state.isActive) {
                self.state.isActive = true;

                self.state.start = self.normalizePointer(event);
                self.state.current = self.state.start;
                self.state.last = self.state.start;
                self.state.path = [self.state.start];
                self.state.position = self.getPosition();

                self.call(self.params.onStart, event, self.getState());
            }

            return self;
        },

        move: function (event) {
            var self = this;

            if (self.state.isActive) {
                self.state.last = self.cleanObject(self.state.current);
                self.state.current = self.normalizePointer(event);

                self.state.delta = {
                    top: self.state.last.top - self.state.current.top,
                    left: self.state.last.left - self.state.current.left
                };

                self.state.path.push(self.state.current);
                self.state.position = self.getPosition();

                self.call(self.params.onMove, event, self.getState());
            }

            return self;
        },

        end: function (event) {
            var self = this;

            if (self.state.isActive) {
                self.state.isActive = false;

                self.state.delta = self.state.current.left - self.state.start.left;
                if (Math.abs(self.state.delta) >= self.params.swipeThreshold) {
                    self.call(self.params.onEnd, event, self.getState());
                } else {
                    self.call(self.params.onCancel, event, self.getState());
                }
            }

            return self;
        },

        cancel: function (event) {
            var self = this;

            if (self.state.isActive) {
                self.state.isActive = false;
                self.state.delta = self.state.current.left - self.state.start.left;
                self.call(self.params.onCancel, event, self.getState());
            }

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind(self.state.EVENTS.START, self.$container, self.params.targetSelector, self.start.bind(self));

            self.bind(self.state.EVENTS.MOVE, self.$DOCUMENT, self.move.bind(self));

            self.bind(self.state.EVENTS.END, self.$DOCUMENT, self.end.bind(self));

            self.bind(self.state.EVENTS.CANCEL, self.$DOCUMENT, self.cancel.bind(self));

            return self;
        },
        init: function () {
            var self = this;

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotSwipe = function (settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotSwipe', new DepotSwipe(container, settings));
        });
    };
}(jQuery));

/**
 * @name depotTabs
 * @version 3.0.0
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/depotTabs.git
 * @license MIT
 */

(function ($) {
    'use strict';

    function DepotTabs(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    DepotTabs.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'depotTabs',
        defaults: {
            tabListSelector: '.js-tabs-list',
            tabsSelector: '.js-tabs-tab',
            panelsSelector: '.js-tabs-panel',
            useHash: false,
            hashParam: 'tab',
            cache: true,
            beforeChange: null,
            onChange: null
        },

        getHashRe: function (param) {
            var self = this;
            if (param === undefined) {
                param = self.params.hashParam;
            }
            return new RegExp('^' + param + '=(.*)$', 'i');
        },

        getHashString: function (value, param) {
            var self = this;
            if (param === undefined) {
                param = self.params.hashParam;
            }
            return [param, value].join('=');
        },

        getTabSlug: function ($tab) {
            var slug;

            if ($tab && $tab.length) {
                slug = $tab.aria('controls');
            }

            return slug;
        },

        getFirstTabSlug: function () {
            var self = this;

            var $firstTab;
            if (self.params.cache) {
                $firstTab = self.$tabs.first();
            } else {
                $firstTab = self.$container.find(self.params.tabListSelector).first();
            }

            return self.getTabSlug($firstTab);
        },

        getValidTabSlug: function (tabSlug) {
            var self = this;
            var validTabSlug;

            if (self.params.cache) {
                if (self.cache.tabs[tabSlug] && self.cache.panels[tabSlug]) {
                    validTabSlug = tabSlug;
                } else if (!self.state.activeTabSlug) {
                    validTabSlug = self.getFirstTabSlug();
                }
            } else {
                var $target = self.getTab(tabSlug);
                if ($target.length) {
                    validTabSlug = tabSlug;
                } else if (!self.state.activeTabSlug) {
                    validTabSlug = self.getFirstTabSlug();
                }
            }

            return validTabSlug;
        },

        getActiveTabSlug: function () {
            var self = this;

            var $activeTab = self.getActiveTab();

            return self.getTabSlug($activeTab);
        },

        getPanelSlug: function ($panel) {
            var slug;

            if ($panel && $panel.length) {
                slug = $panel.attr('id');
            }

            return slug;
        },

        getNextPanelSlug: function () {
            var self = this;

            if (!self.params.cache) {
                self.$panels = self.$container.children(self.params.panelsSelector);
            }

            if (!self.state.$activePanel) {
                self.state.$activePanel = self.$panels.first();
            }

            var $nextPanel = self.state.$activePanel.next(self.params.panelSelector);

            if (!$nextPanel || !$nextPanel.length) {
                $nextPanel = self.$panels.first();
            }

            return self.getPanelSlug($nextPanel);
        },

        getPrevPanelSlug: function () {
            var self = this;

            if (!self.params.cache) {
                self.$panels = self.$container.children(self.params.panelsSelector);
            }

            if (!self.state.$activePanel) {
                self.state.$activePanel = self.$panels.first();
            }

            var $prevPanel = self.state.$activePanel.prev(self.params.panelSelector);

            if (!$prevPanel || !$prevPanel.length) {
                $prevPanel = self.$panels.last();
            }

            return self.getPanelSlug($prevPanel);
        },

        cacheTabs: function () {
            var self = this;

            self.cache.tabs = self.cleanObject();

            self.$tabs.each(function () {
                var $tab = $(this);
                var tabSlug = self.getTabSlug($tab);

                self.cache.tabs[tabSlug] = $tab;
            });
        },

        cachePanels: function () {
            var self = this;

            self.cache.panels = self.cleanObject();

            self.$panels.each(function () {
                var $panel = $(this);
                var tabSlug = self.getPanelSlug($panel);

                self.cache.panels[tabSlug] = $panel;
            });
        },

        getTab: function (tabSlug) {
            var self = this;

            return self.$tabList.find(self.params.tabsSelector + '[aria-controls="' + tabSlug + '"]');
        },

        getPanel: function (tabSlug) {
            var self = this;

            return self.$container.children(self.params.panelsSelector + '[id="' + tabSlug + '"]');
        },

        getActiveTab: function () {
            var self = this;

            var $activeTab;
            if (self.params.cache) {
                $activeTab = self.$tabs.filter('[aria-selected="true"]');
            } else {
                $activeTab = self.$tabList.find(self.params.tabsSelector + '[aria-selected="true"]');
            }

            return $activeTab;
        },

        getActivePanel: function () {
            var self = this;

            var $activepanel;
            if (self.params.cache) {
                $activepanel = self.$panels.filter('[aria-hidden="false"]');
            } else {
                $activepanel = self.$container.children(self.params.panelsSelector + '[aria-hidden="false"]');
            }

            return $activepanel;
        },

        changeTo: function (tabSlug) {
            var self = this;

            if (!self.state.activeTabSlug || self.state.activeTabSlug !== tabSlug) {
                var $newTab;
                var $newPanel;
                var oldTabSlug = self.state.activeTabSlug;

                if (self.params.cache) {
                    $newTab = self.cache.tabs[tabSlug];
                    $newPanel = self.cache.panels[tabSlug];
                } else {
                    $newTab = self.getTab(tabSlug);
                    $newPanel = self.getPanel(tabSlug);
                }

                if ($newTab && $newPanel && $newTab.length && $newPanel.length) {
                    self.call(self.params.beforeChange, self.$container, self.state.$activePanel);

                    self.setInactiveTab(self.getActiveTab());
                    self.setInactivePanel(self.getActivePanel());

                    self.setActiveTab($newTab);
                    self.setActivePanel($newPanel);

                    self.state.activeTabSlug = tabSlug;
                    self.state.$activeTab = $newTab;
                    self.state.$activePanel = $newPanel;

                    self.$WINDOW.trigger('update');

                    if (self.params.useHash && self.hasPlugin('depotHash')) {
                        if (oldTabSlug) {
                            $.depotHash.replaceMatched(self.getHashRe(), self.getHashString(tabSlug), false);
                        } else {
                            $.depotHash.add(self.getHashString(tabSlug), false);
                        }
                    }

                    self.call(self.params.onChange, self.$container, self.state.$activePanel);
                }
            }

            return self;
        },

        changeToFirst: function () {
            var self = this;

            self.changeTo(self.getFirstTabSlug());
        },

        setActivePanel: function ($panel) {
            var self = this;

            if ($panel && $panel.length) {
                $panel.aria('hidden', 'false');
                $panel.attr('tabindex', '0');
            }

            return $panel;
        },

        setInactivePanel: function ($panel) {
            var self = this;

            if ($panel && $panel.length) {
                $panel.aria('hidden', 'true');
                $panel.attr('tabindex', '-1');
            }

            return $panel;
        },

        setActiveTab: function ($tab) {
            var self = this;

            if ($tab && $tab.length) {
                $tab.aria('selected', 'true');
            }

            return $tab;
        },

        setInactiveTab: function ($tab) {
            var self = this;

            if ($tab && $tab.length) {
                $tab.aria('selected', 'false');
            }

            return $tab;
        },

        disableTab: function ($tab) {
            var self = this;

            if ($tab && $tab.length) {
                $tab.aria('disabled', 'true');
            }

            return $tab;
        },

        enableTab: function ($tab) {
            var self = this;

            if ($tab && $tab.length) {
                $tab.aria('disabled', 'false');
            }

            return $tab;
        },

        bindEvents: function () {
            var self = this;

            self.$tabList.on('click', self.params.tabsSelector, function (event) {
                if (event.target === this) {
                    event.preventDefault();
                }
                var $tab = $(this);

                self.debounce('tabClick', function () {
                    self.changeTo(self.getTabSlug($tab));
                });
            });

            self.$tabList.on('keydown', self.params.tabsSelector, function (event) {
                if (event.which === self.KEYS.SPACE || event.which === self.KEYS.ENTER) {
                    if (event.target === this) {
                        event.preventDefault();
                    }
                    var $tab = $(this);

                    self.debounce('tabClick', function () {
                        self.changeTo(self.getTabSlug($tab));
                    });
                }
            });

            if (self.params.useHash) {
                if (self.hasPlugin('depotHash')) {
                    $.depotHash.onChange(function () {
                        var nextTabSlug;

                        $.depotHash.getMatched(self.getHashRe(), function (value, matches) {
                            if (matches && matches[1]) {
                                nextTabSlug = self.getValidTabSlug(matches[1]);
                            }
                        });

                        if (nextTabSlug) {
                            self.changeTo(nextTabSlug);
                        }
                    });
                }
            }

            return self;
        },

        init: function () {
            var self = this;

            if (self.params.cache) {
                self.state.$activeTab = self.getActiveTab();
                self.state.$activePanel = self.getActivePanel();

                self.cacheTabs();
                self.cachePanels();
            }

            var activeTabSlug = self.getActiveTabSlug();

            if (!activeTabSlug) {
                activeTabSlug = self.getFirstTabSlug();
            }

            if (self.params.useHash) {
                if (self.hasPlugin('depotHash')) {
                    $.depotHash.getMatched(self.getHashRe(), function (value, matches) {
                        if (matches && matches[1]) {
                            activeTabSlug = self.getValidTabSlug(matches[1]);
                        }
                    });
                } else {
                    self.params.useHash = false;
                }
            }

            self.changeTo(activeTabSlug);

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.depotTabs = function (settings) {
        return this.each(function (i, container) {
            $.data(this, 'depotTabs', new DepotTabs(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    var CALLBACKS = [];
    var DEFAULTS = {
        type: 'local',
        lang: $.depotProto.LANGUAGE,
        name: 'favorites',
        version: 2
    };

    var NAME = $.depotProto.format('/${name}/v${version}/${lang}/', DEFAULTS);
    var TYPE = DEFAULTS.type;

    function Favorites() {
        var favorites = this;

        $.depotStorage.onChange(function (storageType, storageName) {
            if (storageType === DEFAULTS.type && storageName === NAME) {
                var items = favorites.getAll();
                CALLBACKS.forEach(function (callback) {
                    if (typeof callback === 'function') {
                        callback.call(null, items);
                    }
                });
            }
        });

        return favorites;
    }

    Favorites.prototype = {
        onChange: function (callback) {
            if (typeof callback === 'function' && CALLBACKS.indexOf(callback) === -1) {
                CALLBACKS.push(callback);
            }
            return this;
        },

        offChange: function (callback) {
            if (typeof callback === 'function' && CALLBACKS.indexOf(callback) !== -1) {
                CALLBACKS.splice(CALLBACKS.indexOf(callback), 1);
            } else if (callback === 'all') {
                CALLBACKS = [];
            }

            return this;
        },

        generateKey: function (hrefString) {
            var self = this;
            var link = document.createElement('a');
            link.href = hrefString;

            var url = new URL(link.href);
            return $.depotProto.hashify(url.pathname, 12);
        },

        getAll: function () {
            return $.depotStorage.getItem(NAME, TYPE) || {};
        },

        getItem: function (key) {
            var items = this.getAll();

            return items[key];
        },

        setItem: function (key, item) {
            var items = this.getAll();

            items[key] = item;

            return $.depotStorage.setItem(NAME, items, DEFAULTS);
        },

        removeItem: function (key) {
            var items = this.getAll();

            delete items[key];

            return $.depotStorage.setItem(NAME, items, DEFAULTS);
        },

        toggleItem: function (key, item) {
            var items = this.getAll();

            if (items[key]) {
                return this.removeItem(key);
            } else {
                return this.setItem(key, item);
            }
        }
    };

    $.favorites = new Favorites();
}(jQuery));

(function ($) {
    'use strict';

    function FixHeader (container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    FixHeader.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'fixHeader',

        defaults: {
            headerSelector: '.js-header',
            scrolledClassName: 'is-scrolled',
            fixedClassName: 'is-fixed',
            scrollThreshold: 20,
            mediaQuery: '',
            onChange: null
        },

        getParams: function () {
            var self = this;

            return {
                headerTop: self.$container.offset().top,
                headerHeight: self.$container.outerHeight(),
                scrollTop: self.$WINDOW.scrollTop()
            };
        },

        free: function () {
            var self = this;

            if (self.state.isFixed || self.state.isScrolled) {
                self.state.isFixed = false;
                self.state.isScrolled = false;
                self.$container.removeClass(self.params.fixedClassName);
                self.$container.removeClass(self.params.scrolledClassName);

                self.call(self.params.onChange);
            }

            return self;
        },

        scroll: function () {
            var self = this;

            if (!self.state.isScrolled) {
                self.state.isFixed = false;
                self.state.isScrolled = true;
                self.$container.removeClass(self.params.fixedClassName);
                self.$container.addClass(self.params.scrolledClassName);

                self.call(self.params.onChange);
            }

            return self;
        },

        fix: function () {
            var self = this;

            if (!self.state.isFixed) {
                self.state.isFixed = true;
                self.state.isScrolled = false;
                self.$container.removeClass(self.params.scrolledClassName);
                self.$container.addClass(self.params.fixedClassName);

                self.call(self.params.onChange);
            }

            return self;
        },

        update: function () {
            var self = this;
            var mediaQueryList = window.matchMedia(self.params.mediaQuery);

            if (mediaQueryList && mediaQueryList.matches) {
                var newParams = self.getParams();
                var oldParams = self.state.params;
                var scrollTopDiff = newParams.scrollTop - oldParams.scrollTop;
                var scrollTopDiffAbs = Math.abs(scrollTopDiff);

                if (self.state.scrollTimeout) {
                    clearTimeout(self.state.scrollTimeout);
                }

                if (newParams.scrollTop <= oldParams.headerTop || newParams.scrollTop <= newParams.headerHeight + self.params.scrollThreshold) {
                    self.free();
                    self.state.params = newParams;
                } else if (scrollTopDiff < 0 && scrollTopDiffAbs > self.params.scrollThreshold && newParams.scrollTop > newParams.headerHeight * 2 + newParams.headerTop) {
                    self.fix();
                    self.state.params = newParams;
                } else if (scrollTopDiff > 0 && scrollTopDiffAbs > self.params.scrollThreshold && newParams.scrollTop > newParams.headerHeight * 2 + newParams.headerTop) {
                    self.scroll();
                    self.state.params = newParams;
                } else if (newParams.scrollTop > oldParams.scrollTop && scrollTopDiffAbs > self.params.scrollThreshold) {
                    self.free();
                    self.state.params = newParams;
                }

                self.state.scrollTimeout = setTimeout(function () {
                    self.state.params = self.getParams();
                }, self.params.debounce);
            } else {
                self.free();
            }

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('scroll resize', self.$WINDOW, function () {
                self.update();
            });

            return self;
        },

        getInitialState: function () {
            var self = this;

            return {
                isFixed: false,
                isScrolled: false,
                params: self.getParams()
            };
        }
    });

    $.fn.extend({
        fixHeader: function (settings) {
            return $(this).each(function (i, container) {
                $.data(this, 'fixHeader', new FixHeader(container, settings));
            });
        }
    });
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        formCSRF: {
            onInit: null
        }
    };

    $.formCSRFMixin = {
        initFormCSRF: function () {
            var self = this;

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            var csrftoken = $.depotStorage.getItem('csrftoken', 'cookie');
            if (csrftoken) {
                self.params.requestHeaders = self.params.requestHeaders.concat({
                    name: 'X-CSRFToken',
                    value: csrftoken
                });
            }

            self.call(self.params.formCSRF.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    function FormFieldFile(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    FormFieldFile.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'formFieldFile',

        defaults: {
            labelSelector: '.js-form-field-label',
            valueSelector: '.js-form-field-value',
            elementSelector: '.js-form-field-element',
            valueTemplate: '#{if hasFiles}<div class="field__list">#{for file in files}<div class="field__item"><span>${file.name|escapeHTML}</span> (${file.size})</div>#{endfor}</div>#{endif}',
            dictionary: {
                units: {
                    b: {
                        ru: 'б',
                        en: 'b'
                    },
                    kb: {
                        ru: 'Кб',
                        en: 'Kb'
                    },
                    mb: {
                        ru: 'Мб',
                        en: 'Mb'
                    }
                }
            }
        },

        getInitialState: function () {
            var self = this;
            return {
                hasFiles: false,
                files: []
            };
        },

        render: function () {
            var self = this;

            var valueHTML = self.format(self.params.valueTemplate, self.state);
            self.$value.html(valueHTML);

            return self;
        },

        toFileSize: function (bytes) {
            var self = this;
            var u = 0;
            var thresh = 1000;
            var units = ['b', 'kb', 'mb'];

            while (bytes >= thresh && u < units.length - 1) {
                bytes /= thresh;
                ++u;
            }

            return self.format('${size|fixed(1, false)|digit}_{units.${unit}}', {
                unit: units[u],
                size: bytes
            });
        },

        update: function () {
            var self = this;
            var filesList = [];
            var files = self.$element.get(0).files;
            var filesQuantity = files && files.length || 0;

            if (filesQuantity) {
                self.$container.addClass(self.params.busyClassName);

                for (var fileIndex = 0; fileIndex < filesQuantity; fileIndex += 1) {
                    var file = files.item(fileIndex);
                    filesList.push({
                        name: file.name,
                        size: self.toFileSize(file.size)
                    });
                }
            }

            self.state.hasFiles = filesQuantity > 0;
            self.state.files = filesList;

            self.render();

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.on('input change reset', self.params.elementSelector, function (event) {
                self.update();
            });

            return self;
        },

        init: function () {
            var self = this;

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.formFieldFile = function (settings) {
        return $(this).each(function (i, container) {
            $.data(this, 'formFieldFile', new FormFieldFile(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function FormFieldRange(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    FormFieldRange.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'formFieldRange',

        defaults: {
            labelSelector: '.js-form-field-label',
            valueSelector: '.js-form-field-value',
            elementSelector: '.js-form-field-element',
            minThumbSelector: '.js-form-field-thumb-min',
            maxThumbSelector: '.js-form-field-thumb-max',
            template: '${minThumbTemplate}#{if isMultiple}${maxThumbTemplate}#{endif}#{for step in steps}${stepTemplate}#{endfor}',
            stepTemplate: '<span class="field__step" style="left:${step.left|fixed(6, true)}%;">${step.value}</span>',
            minThumbTemplate: '<span class="field__thumb ${minThumbSelector|substr(1)}" tabindex="0" style="left:${minLeft|default(0)|fixed(6, true)}%"></span>',
            maxThumbTemplate: '<span class="field__thumb ${maxThumbSelector|substr(1)}" tabindex="0" style="left:${maxLeft|default(100)|fixed(6, true)}%"></span>',
            valueTemplate: '${min|zero}:00#{if max}-${max|zero}:00#{endif}',
            getInitialValue: null,
            onChange: null
        },

        getInitialState: function () {
            var self = this;
            var min = self.$element.data('min');
            var max = self.$element.data('max');
            var step = self.$element.data('step');
            var steps = (max - min) / step;
            var initialValue = self.call(self.params.getInitialValue, min, max, step);

            return {
                $target: null,
                isMultiple: self.isMultiple(),
                isDisabled: self.isDisabled(),
                steps: steps,
                step: step,
                min: min,
                max: max,
                value: $.extend(true, self.cleanObject({
                    min: min,
                    max: max,
                }), initialValue)
            };
        },

        isMultiple: function () {
            var self = this;

            return self.$element.data('multiple') || false;
        },

        isDisabled: function () {
            var self = this;

            return self.$element.prop('disabled');
        },

        valueToPosition: function (value) {
            var self = this;

            return (value - self.state.min) / self.state.steps * 100;
        },

        positionToValue: function (position) {
            var self = this;
            // TODO: round to step

            return Math.round(position * self.state.steps + self.state.min);
        },

        render: function () {
            var self = this;

            var context = $.extend(true, self.cleanObject(self.params), {
                isMultiple: self.isMultiple(),
                steps: function () {
                    var steps = [];
                    for (var step = self.state.min; step <= self.state.max; step += self.state.step) {
                        steps.push({
                            left: (step - self.state.min) / self.state.steps * 100,
                            value: self.format(self.params.valueTemplate, {min: step})
                        });
                    }
                    return steps;
                },
                minLeft: self.valueToPosition(self.state.value.min),
                maxLeft: self.valueToPosition(self.state.value.max)
            });

            var rangeHTML = self.format(self.params.template, context);

            self.$value.html(rangeHTML);

            self.getElements();

            self.update();

            return self;
        },

        update: function () {
            var self = this;
            var minLeft = self.valueToPosition(self.state.value.min);
            var maxLeft = self.valueToPosition(self.state.value.max);

            self.$element.val(self.format(self.params.valueTemplate, self.state.value));

            self.$minThumb.css({
                left: minLeft + '%'
            });

            self.$maxThumb.css({
                left: maxLeft + '%'
            });

            self.$value.css(self.prefixed({
                backgroundImage: self.format('linear-gradient(to right, transparent 0%, transparent ${minLeft|fixed(6, true)}%, currentColor ${minLeft|fixed(6, true)}%, currentColor ${maxLeft|fixed(6, true)}%, transparent ${maxLeft|fixed(6, true)}%, transparent 100%)', {
                    minLeft: minLeft,
                    maxLeft: maxLeft
                })
            }));

            return self;
        },

        reset: function (event) {
            var self = this;

            if (event) {
                event.stopPropagation();
            }

            self.state = self.getInitialState();
            self.update();

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.on('reset', self.reset.bind(self));
            self.on('reset', self.params.elementSelector, self.reset.bind(self));

            self.on('keyup', [
                self.params.minThumbSelector,
                self.params.maxThumbSelector
            ], function (event) {
                var $target = $(event.target);
                var isChanged = false;
                var direction = 0;
                var value;

                if (event.which === self.KEYS.ARROW_UP || event.which === self.KEYS.ARROW_LEFT) {
                    direction = -1;
                } else if (event.which === self.KEYS.ARROW_DOWN || event.which === self.KEYS.ARROW_RIGHT) {
                    direction = 1;
                }

                if ($target.is(self.params.minThumbSelector)) {
                    value = self.clamp(self.state.min, self.state.value.min + (direction * self.state.step), self.state.isMultiple ? self.state.value.max - self.state.step : self.state.value.max);
                    if (value !== self.state.value.min) {
                        isChanged = true;
                        self.state.value.min = value;
                    }
                } else if ($target.is(self.params.maxThumbSelector)) {
                    value = self.clamp(self.state.isMultiple ? self.state.value.min + self.state.step : self.state.value.min, self.state.value.max + (direction * self.state.step), self.state.max);
                    if (value !== self.state.value.max) {
                        isChanged = true;
                        self.state.value.max = value;
                    }
                }

                if (isChanged) {
                    self.update();
                }
            });

            self.$value.depotSwipe({
                targetSelector: [
                    self.params.minThumbSelector,
                    self.params.maxThumbSelector
                ],
                onStart: function (event, state) {
                    var $target = $(event.target);
                    if ($target.is(self.params.minThumbSelector) || $target.is(self.params.maxThumbSelector)) {
                        self.$container.addClass(self.params.activeClassName);
                        self.state.$target = $target;
                    }
                },
                onMove: function (event, state) {
                    if (state.isActive && self.state.$target) {
                        var left = state.position.left / self.$value.width();
                        var isChanged = false;
                        var value = self.positionToValue(left);

                        if (self.state.$target.is(self.params.minThumbSelector)) {
                            value = self.clamp(self.state.min, value, self.state.isMultiple ? self.state.value.max - self.state.step : self.state.value.max);
                            if (value !== self.state.value.min) {
                                isChanged = true;
                                self.state.value.min = value;
                            }
                        } else {
                            value = self.clamp(self.state.isMultiple ? self.state.value.min + self.state.step : self.state.value.min, value, self.state.max);
                            if (value !== self.state.value.max) {
                                isChanged = true;
                                self.state.value.max = value;
                            }
                        }

                        if (isChanged) {
                            self.update();
                        }
                    }
                },
                onEnd: function () {
                    self.$container.removeClass(self.params.activeClassName);
                    self.state.$target = null;
                },
                onCancel: function () {
                    self.$container.removeClass(self.params.activeClassName);
                    self.state.$target = null;
                }
            });

            return self;
        },

        init: function () {
            var self = this;

            self.render();

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.formFieldRange = function (settings) {
        return $(this).each(function (i, container) {
            $.data(this, 'formFieldRange', new FormFieldRange(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    function FormFieldSelect(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    FormFieldSelect.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'formFieldSelect',

        defaults: {
            labelSelector: '.js-form-field-label',
            valueSelector: '.js-form-field-value',
            elementSelector: '.js-form-field-element',
            valueTemplate: '#{for item in selected}#{if item.icon}#{endif}${item.text}#{if !loop.isLast}, #{endif}#{endfor}',
            dropDown: {
                template: '<div class="field__dropdown ${dropDown.selector|substr(1)}">${dropDown.listTemplate}#{if isMultiple}${dropDown.actionsTemplate}#{endif}</div>',
                listTemplate: '<ul class="field__list" id="${id}" role="listbox" aria-multiselectable="${isMultiple}" aria-orientation="vertical">${dropDown.listItemsTemplate}</ul>',
                listItemsTemplate: '#{for item in items}<li class="field__item ${dropDown.itemSelector|substr(1)}" data-icon="${item.icon}" data-value="${item.value}" role="option" aria-selected="${item.selected}" aria-disabled="${item.disabled}" tabindex="0">${item.text}</li>#{endfor}',
                actionsTemplate: '<div class="field__actions">${dropDown.buttonApplyTemplate}${dropDown.buttonResetTemplate}</div>',
                buttonApplyTemplate: '<button class="field__button field__button_apply ${dropDown.applySelector|substr(1)}" type="button">_{buttons.apply}</button>',
                buttonResetTemplate: '<button class="field__button field__button_reset ${dropDown.resetSelector|substr(1)}" type="button">_{buttons.reset}</button>',
                selectedClassName: 'is-selected',
                selector: '.js-form-field-dropdown',
                itemSelector: '.js-form-field-item',
                applySelector: '.js-form-field-apply',
                resetSelector: '.js-form-field-reset',
                mediaQuery: '(min-width: 740px)'
            },
            dictionary: {
                buttons: {
                    apply: {
                        ru: 'Применить',
                        en: 'Apply'
                    },
                    reset: {
                        ru: 'Сбросить',
                        en: 'Reset'
                    }
                }
            },
            nullValue: '',
            onChangeSubmit: false,
            onChange: null
        },

        isMultiple: function () {
            var self = this;

            return self.$element.prop('multiple');
        },

        isDisabled: function () {
            var self = this;

            return self.$element.prop('disabled');
        },

        getItemData: function (item) {
            var self = this;
            var $item = $(item);
            var itemData = {
                text: item.textContent.trim(),
                value: $item.data('value') || '',
                icon: $item.data('icon') || '',
                selected: $item.aria('selected') === 'true',
                disabled: $item.aria('disabled') === 'true'
            };
            itemData.hash = self.hashify(itemData, 12);
            return itemData;
        },

        getOptionData: function (option) {
            var self = this;
            var optionData = {
                text: option.textContent.trim(),
                value: option.value,
                icon: $(option).data('icon') || '',
                selected: option.selected,
                disabled: option.disabled
            };
            optionData.hash = self.hashify(optionData, 12);
            return optionData;
        },

        getSelectData: function () {
            var self = this;
            var data = {
                items: [],
                selected: []
            };

            self.$element.find('option').each(function (i, item) {
                var itemData = self.getOptionData(item);
                data.items = data.items.concat(itemData);
                if (itemData.selected) {
                    data.selected = data.selected.concat(itemData);
                }
            });

            if (!data.selected.length) {
                data.selected = data.selected.concat(data.items[0]);
            }

            data.hash = self.hashify(data, 12);

            return data;
        },

        getDropDownData: function () {
            var self = this;
            var data = {
                items: [],
                selected: []
            };

            self.$dropDown.find(self.params.dropDown.itemSelector).each(function (i, item) {
                var itemData = self.getItemData(item);
                data.items = data.items.concat(itemData);
                if (itemData.selected) {
                    data.selected = data.selected.concat(itemData);
                }
            });

            if (!data.selected.length) {
                data.selected = data.selected.concat(data.items[0]);
            }

            data.hash = self.hashify(data, 12);

            return data;
        },

        updateValue: function () {
            var self = this;

            self.$value.html(self.format(self.params.valueTemplate, self.state.data));

            return self;
        },

        updateTabindex: function () {
            var self = this;

            if (self.state.mediaQuery.matches) {
                self.$element.attr('tabindex', '-1');
                self.$value.attr('tabindex', '0');
            } else {
                self.$element.attr('tabindex', '0');
                self.$value.attr('tabindex', '-1');
            }

            return self;
        },

        updateState: function () {
            var self = this;
            var currentData = self.getSelectData();

            if (self.state.data.hash !== currentData.hash) {
                self.state.data = currentData;
                self.updateValue();
            }

            return self;
        },

        update: function () {
            var self = this;
            var dropDownData = self.getDropDownData();

            if (dropDownData.hash !== self.state.data.hash) {
                var $selectItems = self.$element.find('option');

                $.each(dropDownData.items, function (i, dropDownItem) {
                    var stateItem = self.state.data.items[i];
                    var $selectItem = $selectItems.eq(i);
                    if (dropDownItem.hash !== stateItem.hash) {
                        self.state.data.items[i] = dropDownItem;
                        $selectItem.prop('disabled', dropDownItem.disabled);
                        $selectItem.prop('selected', dropDownItem.selected);
                    }
                });
                self.$element.trigger('change');
                self.$element.trigger('focusout');
            }

            return self;
        },

        buildDropDown: function () {
            var self = this;

            if (self.$dropDown) {
                self.$dropDown.remove();
            }

            var dropdownContext = $.extend({
                id: self.eventNameSpace.substr(1),
                isMultiple: self.isMultiple(),
                dropDown: self.params.dropDown
            }, self.state.data);

            var dropDownHTML = self.format(self.params.dropDown.template, dropdownContext);
            var $dropDown = $(dropDownHTML);
            self.$value.aria('controls', dropdownContext.id);
            self.$container.append($dropDown);

            return $dropDown;
        },

        expandDropDown: function () {
            var self = this;

            self.state.isExpanded = true;

            self.$dropDown = self.buildDropDown();

            self.delay(function () {
                var $selectedItem = self.$dropDown.find(self.params.dropDown.itemSelector + '[aria-selected="true"]').first();

                self.$container.addClass(self.params.activeClassName);
                self.$value.aria('expanded', 'true');
                self.$dropDown.aria('hidden', 'false');

                if ($selectedItem.length) {
                    $selectedItem.focus();
                }

                self.$BODY.on(self.addEventNS('click', '.kickoff'), function (event) {
                    if (self.state.isExpanded && !$(event.target).closest(self.params.dropDown.selector).length) {
                        self.collapseDropDown();
                    }
                });

                self.call(self.params.onExpand);
            });

            return self;
        },

        collapseDropDown: function (reset) {
            var self = this;

            self.state.isExpanded = false;
            self.$container.removeClass(self.params.activeClassName);
            self.$value.aria('expanded', 'false');
            self.$dropDown.aria('hidden', 'true');

            self.$BODY.off(self.addEventNS('click', '.kickoff'));

            if (!reset) {
                self.update();
            }

            self.$value.focus();

            self.call(self.params.onCollapse, reset);

            return self;
        },

        toggleDropDown: function () {
            var self = this;

            if (self.state.isExpanded) {
                self.collapseDropDown();
            } else {
                self.expandDropDown();
            }

            return self;
        },

        toggleItem: function ($item, collapse) {
            var self = this;

            var $nullItem = self.$dropDown.find(self.params.dropDown.itemSelector + '[data-value="' + self.params.nullValue + '"]');
            var isSelected = $item.aria('selected') === 'true';
            var isDisabled = $item.aria('disabled') === 'true';

            if (!isDisabled) {
                if ($item.data('value') !== self.params.nullValue) {
                    if (self.isMultiple()) {
                        if (isSelected) {
                            $item.aria('selected', 'false');
                            if (!self.$dropDown.find(self.params.dropDown.itemSelector + '[aria-selected="true"]').length) {
                                $nullItem.aria('selected', 'true').focus();
                            }
                        } else {
                            $item.aria('selected', 'true').focus();
                            $nullItem.aria('selected', 'false');
                        }
                    } else {
                        $item.aria('selected', 'true').focus();
                        $item.siblings().aria('selected', 'false');
                    }
                } else {
                    $nullItem.aria('selected', 'true').focus();
                    $nullItem.siblings().aria('selected', 'false');
                }
            }

            if (!self.isMultiple() || collapse) {
                self.collapseDropDown();
            }

            return self;
        },

        reset: function (event) {
            var self = this;

            if (event) {
                event.stopPropagation();
            }

            self.$element.html(self.state.initialHTML);
            self.delay(function () {
                self.$element.trigger('clear');
                self.updateState();
            }, 10);

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('resize', self.$WINDOW, self.updateTabindex.bind(self));

            self.on('reset', self.params.elementSelector, self.reset.bind(self));
            self.on('change', self.params.elementSelector, function (event) {
                self.updateState();

                self.call(self.params.onChange);

                if (self.params.onChangeSubmit) {
                    self.$container.closest('form').trigger('submit');
                }
            });

            self.on('click', self.params.valueSelector, function (event) {
                if (self.state.mediaQuery.matches) {
                    if (!self.isDisabled()) {
                        event.preventDefault();
                        self.toggleDropDown();
                    }
                }
            });

            self.on('keyup', self.params.valueSelector, function (event) {
                if (self.state.mediaQuery.matches) {
                    if (!self.state.isExpanded && !self.isDisabled()) {
                        if (event.keyCode === self.KEYS.ARROW_DOWN || event.keyCode === self.KEYS.ARROW_UP) {
                            event.preventDefault();

                            self.expandDropDown();
                        }

                        if (event.keyCode === self.KEYS.ESCAPE) {
                            event.preventDefault();
                            event.stopPropagation();

                            self.collapseDropDown(true);
                        }
                    }
                }
            });

            self.on('keydown', self.params.valueSelector, function (event) {
                if (self.state.mediaQuery.matches) {
                    if (event.keyCode === self.KEYS.SPACE || event.keyCode === self.KEYS.ENTER || event.keyCode === self.KEYS.ARROW_DOWN) {
                        event.preventDefault();

                        if (!self.state.isExpanded) {
                            self.expandDropDown();
                        }
                    }
                }
            });

            self.on('transitionend', self.params.dropDown.selector, function (event) {
                self.$dropDown.find(self.params.dropDown.itemSelector + '[aria-selected="true"]').first().focus();
            });

            self.on('keydown', self.params.dropDown.selector, function (event) {
                var $focusItem = self.$dropDown.find(self.params.dropDown.itemSelector + ':focus');

                if ((event.keyCode === self.KEYS.TAB) || event.keyCode === self.KEYS.ARROW_DOWN || event.keyCode === self.KEYS.ARROW_UP) {
                    event.preventDefault();

                    if (event.keyCode === self.KEYS.ARROW_DOWN || (!event.shiftKey && event.keyCode === self.KEYS.TAB)) {
                        var $nextItem = $focusItem.next();
                        if (!$nextItem.length) {
                            $nextItem = self.$dropDown.find(self.params.dropDown.itemSelector).first();
                        }

                        $nextItem.focus();
                    } else if (event.keyCode === self.KEYS.ARROW_UP || (event.shiftKey && event.keyCode === self.KEYS.TAB)) {
                        var $prevItem = $focusItem.prev();
                        if (!$prevItem.length) {
                            $prevItem = self.$dropDown.find(self.params.dropDown.itemSelector).last();
                        }

                        $prevItem.focus();
                    }
                }

                if (event.keyCode === self.KEYS.SPACE) {
                    event.preventDefault();

                    self.toggleItem($focusItem);
                }

                if (event.keyCode === self.KEYS.ENTER) {
                    event.preventDefault();

                    self.toggleItem($focusItem);
                    self.collapseDropDown();
                }

                if (event.keyCode === self.KEYS.ESCAPE) {
                    event.preventDefault();
                    event.stopPropagation();

                    self.collapseDropDown(true);
                }
            });

            self.on('click', self.params.dropDown.applySelector, function (event) {
                event.preventDefault();

                self.collapseDropDown();
            });

            self.on('click', self.params.dropDown.resetSelector, function (event) {
                event.preventDefault();

                self.collapseDropDown(true);
            });

            self.on('click', self.params.dropDown.itemSelector, function (event) {
                event.preventDefault();

                self.toggleItem($(this));
            });

            return self;
        },

        getInitialState: function () {
            var self = this;

            return {
                data: {
                    items: [],
                    selected: []
                },
                mediaQuery: window.matchMedia(self.params.dropDown.mediaQuery),
                initialHTML: self.$element.html(),
                isDisabled: self.isDisabled()
            };
        },

        init: function () {
            var self = this;

            self.updateState();
            self.updateTabindex();

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.formFieldSelect = function (settings) {
        return $(this).each(function (i, container) {
            $.data(this, 'formFieldSelect', new FormFieldSelect(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';
    //TODO: не работает проверка рекапчи, форма сабмитится!

    var GRECAPTCHA_LOAD_CALLBACKS = [];
    var MIXIN_DEFAULTS = {
        formGRecaptcha: {
            formGRecaptchaSelector: '.js-form-field-grecaptcha > div',
            render: false,
            onInit: null,
            onError: null,
            onRefresh: null
        },
        dictionary: {
            errors: {
                grecaptcha: {
                    ru: 'Пройдите проверку',
                    en: 'Get Verified'
                }
            }
        }
    };

    $.formGRecaptchaMixin = {
        loadFormGRecaptchaAPI: function (callback) {
            var self = this;

            if (window.formGRecaptchaReady === undefined) {
                window.formGRecaptchaReady = false;

                window.onGRecaptchaLoadCallback = function () {
                    window.formGRecaptchaReady = true;
                };

                var src = 'https://www.google.com/recaptcha/api.js?';
                var script = document.createElement('script');

                script.src = src + $.param({
                    onload: 'onGRecaptchaLoadCallback',
                    render: 'explicit',
                    hl: document.documentElement.lang
                });

                document.head.appendChild(script);
            }

            self.delay(function () {
                if (window.formGRecaptchaReady === true) {
                    if (typeof callback === 'function') {
                        callback();
                        self.$formGRecaptcha.removeClass('is-processing');
                    }
                } else {
                    self.loadFormGRecaptchaAPI(callback);
                }
            }, 300);

            return self;
        },

        renderFormGRecaptcha: function () {
            var self = this;
            self.$formGRecaptcha.addClass('is-processing');

            self.loadFormGRecaptchaAPI(function () {
                if (self.cache.formGRecaptcha.id === undefined) {
                    self.setErrorFor(self.cache.formGRecaptcha.field, 'is-required', self.getText('errors.grecaptcha'));
                    self.checkSubmit();

                    self.cache.formGRecaptcha.id = window.grecaptcha.render(self.state.formGRecaptcha.elementID, {
                        sitekey: self.state.formGRecaptcha.key,
                        callback: function (hash) {
                            self.cache.formGRecaptcha.field.value = hash;
                            self.removeErrorFor(self.cache.formGRecaptcha.field, 'is-required');
                            self.checkSubmit();
                        }
                    });
                }
            });

            return self;
        },

        refreshFormGRecaptcha: function () {
            var self = this;

            if (window.formGRecaptchaReady === true && self.cache.formGRecaptcha.id !== undefined) {
                try {
                    window.grecaptcha.reset(self.cache.formGRecaptcha.id);
                    self.setErrorFor(self.cache.formGRecaptcha.field, 'is-required', self.getText('errors.grecaptcha'));
                    self.checkSubmit();
                } catch (error) {
                    self.error(error);
                    self.renderFormGRecaptcha();
                }
            } else {
                self.renderFormGRecaptcha();
            }

            return self;
        },

        initFormGRecaptcha: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, {}, this, {
                    formGRecaptcha: {
                        elementID: self.$formGRecaptcha.attr('id'),
                        key: self.$formGRecaptcha.data('key')
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.getElements(self.params.formGRecaptcha);

            self.state = self.getInitialState();
            self.cache.formGRecaptcha = self.cleanObject();

            if (self.$formGRecaptcha && self.$formGRecaptcha.length) {
                self.cache.formGRecaptcha.field = {id: self.state.formGRecaptcha.elementID, type: 'hidden', value: ''};

                self.reset = self.proxyCallback(self.reset, function () {
                    return self.refreshFormGRecaptcha();
                });

                self.on('grecaptcha:refresh', function () {
                    self.refreshFormGRecaptcha();
                });

                self.on('click', self.params.formGRecaptcha.formGRecaptchaSelector, function () {
                    self.refreshFormGRecaptcha();
                });

                if (self.params.formGRecaptcha.render) {
                    self.refreshFormGRecaptcha();
                }

                self.call(self.params.formGRecaptcha.onInit);
            }
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        formMessage: {
            formBodySelector: '.js-form-body',
            formMessageSelector: '.js-form-message',
            formMessageBodySelector: '.js-form-message-body',
            formMessageLabelSelector: '.js-form-message-label',
            formMessageTextSelector: '.js-form-message-text',
            formMessageCloseSelector: '.js-form-message-close',
            successTimeout: 10000,
            errorTimeout: 10000,
            timeout: 10000,
            onInit: null,
            onShow: null,
            onHide: null
        }
    };

    $.formMessageMixin = {
        showFormMessage: function (message, timeout) {
            var self = this;

            if (!self.state.formMessage.isVisible) {
                self.state.formMessage.isVisible = true;

                if (message) {
                    self.$formMessageLabel.html(message.label || message.title || '');
                    self.$formMessageText.html(message.body || '');
                }

                self.$formMessage.aria('hidden', 'false');

                if (self.$formBody.length) {
                    self.$formBody.aria('hidden', 'true');
                }

                if (message.success === true) {
                    self.$formMessageBody.attr('data-success', 'true');
                } else if (message.success === false) {
                    self.$formMessageBody.attr('data-success', 'false');
                } else {
                    self.$formMessageBody.removeAttr('data-success');
                }

                if (timeout === undefined) {
                    if (message.success === true) {
                        timeout = self.params.formMessage.successTimeout;
                    } else if (message.success === false) {
                        timeout = self.params.formMessage.errorTimeout;
                    } else {
                        timeout = self.params.formMessage.timeout;
                    }
                }
                if (timeout) {
                    if (self.state.formMessage.hideTimeout) {
                        self.cancelDelay(self.state.formMessage.hideTimeout);
                    }

                    if (typeof timeout === 'number') {
                        self.$formMessageBody.attr('data-autohide', 'true');
                        self.$formMessageBody.get(0).style.setProperty('--autohide-delay', timeout + 'ms');

                        self.state.formMessage.hideTimeout = self.delay(function () {
                            self.hideFormMessage(true);
                        }, timeout);

                        self.$BODY.on(self.addEventNS('click', '.message:click'), function (event) {
                            if (self.state.formMessage.isVisible) {
                                if ($(event.target).closest('body').length && !$(event.target).closest(self.params.formMessage.formMessageBodySelector).length) {
                                    self.hideFormMessage();
                                }
                            }
                        });
                    }
                }

                self.call(self.params.formMessage.onShow, message);
            }

            return self;
        },

        hideFormMessage: function (force) {
            var self = this;

            if (self.state.formMessage.isVisible || force) {
                self.state.formMessage.isVisible = false;

                self.$formMessage.aria('hidden', 'true');
                self.$formMessageBody.removeAttr('data-success');

                self.$formMessageLabel.empty();
                self.$formMessageText.empty();

                if (self.$formBody.length) {
                    self.$formBody.aria('hidden', 'false');
                }

                self.$BODY.off(self.addEventNS('click', '.message:click'));

                self.call(self.params.formMessage.onHide);
            }

            return self;
        },

        bindFormMessageEvents: function () {
            var self = this;

            self.on('click', self.params.formMessage.formMessageCloseSelector, function (event) {
                event.preventDefault();
                self.hideFormMessage();
            });

            self.on('message:show', function (event, message, timeout) {
                self.showFormMessage(message || event.message, timeout || event.timeout);
            });

            self.on('message:hide', function (event, force) {
                self.hideFormMessage(force || event.force);
            });

            self.$BODY.on(self.addEventNS('keyup', '.message:key'), function (event) {
                if (self.state.formMessage.isVisible && event.which === self.KEYS.ESCAPE) {
                    event.preventDefault();
                    self.hideFormMessage();
                }
            });

            return self;
        },

        initFormMessage: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, {}, this, {
                    formMessage: {
                        isVisible: false
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.getElements(self.params.formMessage);

            self.state = self.getInitialState();

            self.params.onReset = self.proxyCallback(self.params.onReset, function () {
                return self.hideFormMessage(true);
            });

            self.bindFormMessageEvents();

            self.call(self.params.formMessage.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        formResponse: {
            responseErrorsSelector: '.js-form-response-error',
            responseLabelSelector: '.js-form-response-label',
            responseBodySelector: '.js-form-response-body',
            message: {
                success: true,
                error: true
            },
            reset: true,
            onInit: null,
            onSuccess: null,
            onError: null
        }
    };

    $.formResponseMixin = {
        initFormResponse: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, {}, this, {
                    formResponse: {}
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.getElements(self.params.formResponse);

            self.state = self.getInitialState();

            self.params.onSubmit = self.proxyCallback(self.params.onSubmit, function (response) {
                if (response) {
                    var $response = $(response).closest('form[name="' + self.$container.attr('name') + '"]');
                    var $responseErrors = $response.find(self.params.formResponse.responseErrorsSelector);
                    var responseLabel = $response.find(self.params.formResponse.responseLabelSelector).text();
                    var responseBody = $response.find(self.params.formResponse.responseBodySelector).text();
                    var responseObject = {};

                    if (responseLabel && responseBody) {
                        responseObject.label = responseLabel;
                        responseObject.body = responseBody;

                        self.call(self.params.formResponse.onSuccess, responseObject);

                        if (self.params.formResponse.message.success && responseObject.body) {
                            self.showFormMessage(responseObject);
                        }

                        if (self.params.formResponse.reset) {
                            self.reset();
                        }
                    } else if ($responseErrors.length) {
                        responseObject.errors = {};
                        $responseErrors.each(function (i, error) {
                            var $error = $(error);
                            var errorText = $error.text();
                            var errorField = $error.data('field');
                            if (!responseObject.errors[errorField]) {
                                responseObject.errors[errorField] = [errorText];
                            } else {
                                responseObject.errors[errorField].push(errorText);
                            }
                        });

                        self.call(self.params.formResponse.onError, responseObject);
                        $.each(responseObject.errors, function (elementName, errors) {
                            self.setExternalErrorFor(self.container[elementName], errors[0]);
                        });
                    } else {
                        self.deleteFormData();
                        self.call(self.params.formResponse.onError, response);
                        self.error({
                            action: 'depotForm.onSubmit',
                            data: {
                                response: response
                            },
                            name: 'UnexpectedError',
                            message: 'Неожиданный ответ сервера'
                        });
                    }
                }
            });

            self.params.onError = self.proxyCallback(self.params.onError, function (error, status, description) {
                self.showFormMessage({
                    title: status,
                    body: description
                }, 10000);

                return self;
            });

            self.call(self.params.formResponse.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        dictionary: {},
        galleryContent: {
            targetElements: [
                '~ *'
            ],
            headElements: [
                'title',
                'meta[name="description"]',
                'meta[name="keywords"]'
            ],
            onInsert: null,
            onInit: null
        }
    };

    $.galleryContentMixin = {
        createHistoryState: function (newHistoryState) {
            var currentHistoryState = window.history && window.history.state || {};
            return $.extend(true, {}, currentHistoryState, {
                galleryContent: newHistoryState
            });
        },

        contentInsert: function (url, $document) {
            var self = this;

            if (self.params.galleryContent.headElements && self.params.galleryContent.headElements.length) {
                self.params.galleryContent.headElements.forEach(function (selector) {
                    var $currentHead = self.$DOCUMENT.find('head');
                    var $newHead = $document.find('head');

                    var $currentHeadElement = $currentHead.find(selector);
                    var $newHeadElement = $newHead.find(selector);

                    if ($currentHeadElement && $currentHeadElement.length) {
                        $currentHeadElement.replaceWith($newHeadElement.clone());
                    } else {
                        $currentHead.append($newHeadElement.clone());
                    }
                });
            }

            var $targets = $document.find(self.getSelector() + self.params.galleryContent.targetElements).clone();
            self.$container.nextAll().trigger('destroy').remove();
            self.$container.after($targets);
            $targets.trigger('lazy:added').trigger('figure:added');

            if (self.state.galleryContent.pushStateEnabled) {
                if (window.history && typeof window.history.pushState === 'function') {
                    var title = $document.get(0).title || '';
                    var historyState = self.createHistoryState({
                        currentRealIndex: self.state.currentRealIndex
                    });
                    window.history.pushState(historyState, title, url);
                }
            } else {
                self.state.galleryContent.pushStateEnabled = true;
            }

            self.call(self.params.galleryContent.onInsert);

            return self;
        },
        contentRequest: function (url) {
            var self = this;

            if (self.state.galleryContent.request) {
                self.state.galleryContent.request.abort();
            }

            var $cachedDocument = self.cache.galleryContent.documents[url];

            if ($cachedDocument) {
                self.contentInsert(url, $cachedDocument);
            } else {
                self.state.galleryContent.request = $.ajax({
                    url: url,
                    type: 'GET',
                    dataType: 'html',
                    complete: function (jqXHR, textStatus) {
                        if (jqXHR.status === 200 && textStatus === 'success') {
                            var parser = new DOMParser();
                            var $document = $(parser.parseFromString(jqXHR.responseText, 'text/html'));
                            self.cache.galleryContent.documents[url] = $document;
                            self.contentInsert(url, $document);
                        }
                    }
                });
            }

            return self;
        },
        initGalleryContent: function () {
            var self = this;

            self.cache.galleryContent = {
                documents: self.params.cachedDocuments || {}
            };

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, {}, this, {
                    galleryContent: {
                        pushStateEnabled: true,
                        request: null
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.state = self.getInitialState();

            self.params.beforeChange = self.proxyCallback(self.params.beforeChange, function (DOMIndex, force) {
                if (!force) {
                    var $nextItem = self.$items.eq(DOMIndex);
                    var nextURL = $nextItem.data('url');

                    self.contentRequest(nextURL);
                }
            });

            self.bind('popstate', self.$WINDOW, function (event) {
                var historyState = event.originalEvent.state;
                if (historyState && historyState.galleryContent) {
                    self.state.galleryContent.pushStateEnabled = false;
                    var nextDOMIndex = self.getClosestDOMIndex(historyState.galleryContent.currentRealIndex);
                    self.throttle('goTo', function () {
                        self.goTo(nextDOMIndex);
                    });
                }
            });

            if (window.history && typeof window.history.replaceState === 'function') {
                var title = self.$DOCUMENT.get(0).title || '';
                var historyState = self.createHistoryState({
                    currentRealIndex: self.state.currentRealIndex
                });

                window.history.replaceState(historyState, title);
            }

            self.call(self.params.galleryContent.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        dictionary: {
            favorites: {
                add: {
                    ru: 'Добавить в избранное',
                    en: 'Add to favourites'
                },
                active: {
                    ru: 'В избранном',
                    en: 'Favorite'
                }
            }
        },
        galleryFavorites: {
            favoriteButtonSelector: '.js-gallery-favorite',
            favoriteButtonTemplate: '<button class="carousel__favorite button button_inline ${favoriteButtonSelector|substr(1)}#{if isFavorite} is-active#{endif}" type="button" data-key="${key}">#{if isFavorite}_{favorites.active}#{else}_{favorites.add}#{endif}</button>',
            onInit: null
        }
    };

    $.galleryFavoritesMixin = {
        updateFavorites: function () {
            var self = this;

            var $favoriteButtons = self.$container.find(self.params.galleryFavorites.favoriteButtonSelector);
            $favoriteButtons.each(function (i, button) {
                var $button = $(button);
                var $item = $button.closest(self.params.itemsSelector);
                var url = $item.data('url');
                var key = $.favorites.generateKey(url);
                var isFavorite = self.state.galleryFavorites.favorites[key];
                var favoriteButtonContext = $.extend(true, self.cleanObject(self.params.galleryFavorites), {
                    key: key,
                    isFavorite: isFavorite
                });
                var favoriteButtonHTML = self.format(self.params.galleryFavorites.favoriteButtonTemplate, favoriteButtonContext);

                $button.replaceWith(favoriteButtonHTML);
            });

            return self;
        },
        initGalleryFavorites: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, {}, this, {
                    galleryFavorites: {
                        favorites: $.favorites.getAll()
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.state = self.getInitialState();

            self.bindEvents = self.proxyCallback(self.bindEvents, function () {
                $.favorites.onChange(function (favorites) {
                    self.state.galleryFavorites.favorites = favorites;
                    self.updateFavorites();
                });

                self.on('click', self.params.galleryFavorites.favoriteButtonSelector, function (event) {
                    event.preventDefault();
                    var $item = $(this).closest(self.params.itemsSelector);
                    var url = $item.data('url');
                    var key = $.favorites.generateKey(url);
                    var item = {
                        label: document.title,
                        text: $item.find('.slide__text').text(),
                        image: $item.find('.slide__image').attr('src'),
                        url: url
                    };

                    $.favorites.toggleItem(key, item);
                });
            });

            self.$items.each(function (i, item) {
                var $item = $(item);
                var url = $item.data('url');
                var key = $.favorites.generateKey(url);
                var isFavorite = self.state.galleryFavorites.favorites[key];
                var favoriteButtonContext = $.extend(true, self.cleanObject(self.params.galleryFavorites), {
                    key: key,
                    isFavorite: isFavorite
                });
                var favoriteButtonHTML = self.format(self.params.galleryFavorites.favoriteButtonTemplate, favoriteButtonContext);

                $item.append(favoriteButtonHTML);
            });

            self.call(self.params.galleryContent.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        galleryItems: {
            variable: 'galleryItems',
            onInit: null
        }
    };

    var READY = false;

    $.galleryItemsMixin = {
        fetchGalleryItems: function (callback) {
            var self = this;

            return self;
        },
        galleryItemsInit: function () {
            var self = this;

            if (READY) {
                self.unbindEvents();
                self.bindEvents();
                self.call(self.cache.init);
            }
        },
        initGalleryItems: function (callback) {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {

                return $.extend(true, {}, this, {
                    galleryItems: {
                        items: []
                    }
                });
            });

            self.params = $.extend(true, {}, MIXIN_DEFAULTS, self.params);
            self.state = self.getInitialState();
            self.cache.galleryItems = {
                init: self.init,
                documents: {}
            };

            self.init = self.galleryItemsInit;

            self.fetchGalleryItems(function () {
                self.call(callback);
                self.galleryItemsInit();
            });

            self.call(self.params.galleryItems.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        dictionary: {
            buttons: {
                backwards: {
                    ru: 'Назад',
                    en: 'Backwards'
                },
                forwards: {
                    ru: 'Вперед',
                    en: 'Forwards'
                }
            }
        },
        galleryNavigation: {
            template: '<div class="gallery__navigation">${buttonBackwardsTemplate}${buttonForwardsTemplate}</div>${bulletsTemplate}',
            buttonBackwardsTemplate: '<button class="gallery__button gallery__button_backwards ${backwardsSelector|substr(1)}" type="button" aria-label="_{buttons.backwards}" title="_{buttons.backwards}"#{if backwardsDisabled} disabled#{endif}></button>',
            buttonForwardsTemplate: '<button class="gallery__button gallery__button_forwards ${forwardsSelector|substr(1)}" type="button" aria-label="_{buttons.forwards}" title="_{buttons.forwards}"#{if forwardsDisabled} disabled#{endif}></button>',
            bulletsTemplate: '#{if showNavigation}<div class="gallery__bullets">#{for bullet in 1..${bullets}}${bulletTemplate}#{endfor}</div>#{endif}',
            bulletTemplate: '<button class="gallery__bullet ${bulletsSelector|substr(1)}" type="button" data-index="${bullet}"></button>',
            backwardsSelector: '.js-gallery-backwards',
            forwardsSelector: '.js-gallery-forwards',
            bulletsSelector: '.js-gallery-bullet',
            onInit: null
        }
    };

    $.galleryNavigationMixin = {
        navigationRender: function () {
            var self = this;
            var navigationContext = $.extend(true, {}, self.params.galleryNavigation, {
                showNavigation: self.state.itemsQuantity > 1,
                backwardsDisabled: self.state.galleryNavigation.backwardsDisabled,
                forwardsDisabled: self.state.galleryNavigation.forwardsDisabled,
                bullets: self.state.itemsQuantity
            });

            var navigationHTML = self.format(self.params.galleryNavigation.template, navigationContext);

            self.$viewport.after(navigationHTML);

            self.getElements(self.params.galleryNavigation);

            return self;
        },

        navigationUpdate: function () {
            var self = this;

            self.state.galleryNavigation.backwardsDisabled = !self.params.loop && self.state.currentRealIndex === 1;
            self.state.galleryNavigation.forwardsDisabled = !self.params.loop && self.state.currentRealIndex === self.state.itemsQuantity;

            self.navigationBulletsUpdate();
            self.navigationButtonsUpdate();

            return self;
        },

        navigationBulletsUpdate: function () {
            var self = this;

            self.$bullets.filter('[aria-current="true"]').removeAria('current');
            self.$bullets.filter('[data-index="' + self.state.currentRealIndex + '"]').aria('current', 'true');

            return self;
        },

        navigationButtonsUpdate: function () {
            var self = this;

            self.$backwards.prop('disabled', self.state.galleryNavigation.backwardsDisabled);
            self.$forwards.prop('disabled', self.state.galleryNavigation.forwardsDisabled);

            return self;
        },

        navigationBindEvents: function () {
            var self = this;

            self.on('click', self.params.galleryNavigation.backwardsSelector, function (event) {
                event.preventDefault();
                self.throttle('backwards', self.goBackwards);
            });

            self.on('click', self.params.galleryNavigation.forwardsSelector, function (event) {
                event.preventDefault();
                self.throttle('forwards', self.goForwards);
            });

            self.on('click', self.params.galleryNavigation.bulletsSelector, function (event) {
                event.preventDefault();
                var $bullet = $(this);
                var realIndex = $bullet.data('index');
                var nextDOMIndex = self.getClosestDOMIndex(realIndex);

                self.throttle('goTo', function () {
                    self.goTo(nextDOMIndex);
                });
            });

            return self;
        },
        initGalleryNavigation: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {

                return $.extend(true, {}, this, {
                    galleryNavigation: {
                        backwardsDisabled: true,
                        forwardsDisabled: true
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.state = self.getInitialState();

            self.params.onChange = self.proxyCallback(self.params.onChange, function (DOMIndex, force) {
                if (!force) {
                    self.navigationUpdate();
                }
            });

            self.navigationRender();
            self.navigationUpdate();
            self.navigationBindEvents();

            self.call(self.params.galleryNavigation.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        dictionary: {},
        galleryRotation: {
            bodyCroppedClassName: 'is-cropped',
            delay: 500,
            onInit: null
        }
    };

    $.galleryRotationMixin = {
        inViewport: function () {
            var self = this;
            var $sticky = $('js-sticky');
            var stickyHeight = 0;

            $sticky.each(function (i, stickyElement) {
                stickyHeight += $(stickyElement).outerHeight();
            });

            var containerTop = self.$container.offset().top;
            var containerBottom = containerTop + self.$container.outerHeight(true);
            var windowTop = self.$WINDOW.scrollTop() + stickyHeight;
            var windowBottom = windowTop + self.$WINDOW.innerHeight();

            var isAboveViewport = containerBottom < windowTop;
            var isUnderViewport = containerTop > windowBottom;
            var isBehindPopup = self.$BODY.hasClass(self.params.galleryRotation.bodyCroppedClassName);
            var documentVisible = document.visibilityState !== 'hidden';

            return !(isAboveViewport || isUnderViewport || isBehindPopup) && documentVisible;
        },

        startRotation: function () {
            var self = this;

            if (!self.state.galleryRotation.isRunning && self.$items.length > 1) {
                self.state.galleryRotation.isRunning = true;

                if (self.inViewport()) {
                    self.state.galleryRotation.isRunning = true;

                    self.state.galleryRotation.animation = self.animate(100000, function () {
                        if (!self.state.galleryRotation.isPaused && !self.state.preventClick) {
                            var timestamp = self.now();
                            if (!self.state.galleryRotation.timestamp) {
                                self.state.galleryRotation.timestamp = timestamp;
                            }

                            var delta = timestamp - self.state.galleryRotation.timestamp;

                            if (delta >= self.params.galleryRotation.delay) {
                                self.state.galleryRotation.timestamp = timestamp;
                                self.goForwards();
                            }
                        }
                    });
                }
            }

            return self;
        },

        resumeRotation: function () {
            var self = this;

            self.state.galleryRotation.isPaused = false;

            return self;
        },

        pauseRotation: function () {
            var self = this;

            self.state.galleryRotation.isPaused = true;

            return self;
        },

        bindGalleryRotationEvents: function () {
            var self = this;

            self.bind('scroll resize', self.$WINDOW, function () {
                self.throttle('scroll', function () {
                    if (self.state.galleryRotation.isRunning) {
                        var inViewport = self.inViewport();
                        if (inViewport) {
                            self.resumeRotation();
                        } else {
                            self.pauseRotation();
                        }
                    }
                });
            });

            self.bind('visibilitychange', self.$DOCUMENT, function () {
                if (self.state.galleryRotation.isRunning) {
                    var inViewport = self.inViewport();
                    if (inViewport) {
                        self.resumeRotation();
                    } else {
                        self.pauseRotation();
                    }
                }
            });

            return self;
        },

        initGalleryRotation: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, {}, this, {
                    galleryRotation: {
                        isPaused: false,
                        isRunning: false,
                        animation: null,
                        timestamp: null
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.params.beforeChange = self.proxyCallback(self.params.beforeChange, function (DOMIndex, force) {
                if (!force) {
                    self.pauseRotation();
                }
            });

            self.params.onTransitionEnd = self.proxyCallback(self.params.onTransitionEnd, function () {
                self.state.galleryRotation.timestamp = self.now();
                self.resumeRotation();
            });

            self.state = self.getInitialState();

            self.bindGalleryRotationEvents();

            self.startRotation();

            self.call(self.params.galleryRotation.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        dictionary: {
            thumbs: {
                backwards: {ru: 'Назад', en: 'Backwards'},
                forwards: {ru: 'Вперед', en: 'Forwards'}
            }
        },
        galleryThumbs: {
            template: '<div class="gallery__thumbs thumbs"><div class="thumbs__viewport ${thumbsViewportSelector|substr(1)}"><ul class="thumbs__list ${thumbsListSelector|substr(1)}">#{for item in items}${thumbTemplate}#{endfor}</ul></div>${thumbsButtonBackwardsTemplate}${thumbsButtonForwardsTemplate}${thumbsBulletsTemplate}</div>',
            thumbTemplate: '<li class="thumbs__item ${thumbsSelector|substr(1)}" data-index="${item.index}"><img class="thumbs__image js-thumbs-image" src="${item.thumb}" alt="${item.index}"></li>',
            thumbsButtonBackwardsTemplate: '#{if buttonsEnabled}<button class="thumbs__button thumbs__button_backwards ${thumbsBackwardsSelector|substr(1)}" type="button" aria-label="_{thumbs.backwards}" title="_{thumbs.backwards}" disabled></button>#{endif}',
            thumbsButtonForwardsTemplate: '#{if buttonsEnabled}<button class="thumbs__button thumbs__button_forwards ${thumbsForwardsSelector|substr(1)}" type="button" aria-label="_{thumbs.forwards}" title="_{thumbs.forwards}" disabled></button>#{endif}',
            thumbsBulletsTemplate: '#{if buttonsEnabled}<div class="thumbs__bullets">#{for bullet in 1..${bullets}}${thumbsBulletTemplate}#{endfor}</div>#{endif}',
            thumbsBulletTemplate: '<button class="thumbs__bullet ${thumbsBulletsSelector|substr(1)}" type="button" data-index="${bullet}"></button>',
            thumbsViewportSelector: '.js-thumbs-viewport',
            thumbsListSelector: '.js-thumbs-list',
            thumbsSelector: '.js-thumbs-item',
            thumbsBackwardsSelector: '.js-thumbs-backwards',
            thumbsForwardsSelector: '.js-thumbs-forwards',
            thumbsBulletsSelector: '.js-thumbs-bullet',
            onPage: 2,
            mediaQueries: {},
            onInit: null
        }
    };

    $.galleryThumbsMixin = {
        thumbsRender: function () {
            var self = this;
            var thumbsContext = $.extend(true, {}, self.params.galleryThumbs, {
                items: self.state.items,
                buttonsEnabled: self.state.itemsQuantity > self.state.galleryThumbs.onPage,
                bullets: self.state.galleryThumbs.bulletsQuantity
            });

            var thumbsHTML = self.format(self.params.galleryThumbs.template, thumbsContext);

            self.$viewport.after(thumbsHTML);

            self.getElements(self.params.galleryThumbs);

            return self;
        },
        thumbsUpdate: function () {
            var self = this;

            self.$thumbs.filter('[aria-current="true"]').removeAria('current');
            self.$thumbs.filter('[data-index="' + self.state.currentRealIndex + '"]').aria('current', 'true');
            self.state.galleryThumbs.currentBulletIndex = Math.ceil(self.state.currentRealIndex / self.state.galleryThumbs.onPage);

            if (self.state.currentRealIndex - 1 > self.state.galleryThumbs.targetDOMIndex + self.state.galleryThumbs.onPage - 1 || self.state.currentRealIndex - 1 < self.state.galleryThumbs.targetDOMIndex) {
                self.thumbsGoToBullet(self.state.galleryThumbs.currentBulletIndex);
            }

            return self;
        },
        thumbsBulletsUpdate: function () {
            var self = this;

            self.$thumbsBullets.filter('[aria-current="true"]').removeAria('current');
            self.$thumbsBullets.filter('[data-index="' + self.state.galleryThumbs.currentBulletIndex + '"]').aria('current', 'true');

            return self;
        },
        thumbsButtonsUpdate: function () {
            var self = this;

            self.$thumbsBackwards.prop('disabled', self.state.galleryThumbs.currentBulletIndex === 1);
            self.$thumbsForwards.prop('disabled', self.state.galleryThumbs.currentBulletIndex === self.state.galleryThumbs.bulletsQuantity);

            return self;
        },
        thumbsOnTransitionEnd: function () {
            var self = this;
            self.cancelDelay(self.state.galleryThumbs.transitionDelay);

            self.$thumbsList.removeClass(self.params.transitionClassName);
            self.$thumbsList.removeClass(self.params.slowTransitionClassName);
            self.state.galleryThumbs.isTransition = false;
            self.state.galleryThumbs.preventClick = false;

            return self;
        },
        thumbsGoTo: function (DOMIndex, force) {
            var self = this;
            var targetDOMIndex = self.clamp(0, DOMIndex, self.state.itemsQuantity);

            if (targetDOMIndex < 0 || self.state.itemsQuantity <= self.state.galleryThumbs.onPage) {
                targetDOMIndex = 0;
            } else if (targetDOMIndex + self.state.galleryThumbs.onPage > self.state.itemsQuantity) {
                targetDOMIndex = self.state.itemsQuantity - self.state.galleryThumbs.onPage;
            }

            var $target = self.$thumbs.eq(targetDOMIndex);
            var realIndex = self.$thumbs.eq(targetDOMIndex).data('index');

            if (!self.state.galleryThumbs.current) {
                self.state.galleryThumbs.current = $target.get(0);
                self.state.galleryThumbs.$current = $target;
            }

            self.state.galleryThumbs.preventClick = !force;
            self.state.galleryThumbs.currentDOMIndex = targetDOMIndex;
            self.state.galleryThumbs.targetDOMIndex = targetDOMIndex;
            self.state.galleryThumbs.currentBulletIndex = Math.ceil((realIndex + 1) / self.state.galleryThumbs.onPage);

            self.moveListToPositionLeft(self.$thumbsList, self.getItemPosition($target), self.state.galleryThumbs, force);
            self.thumbsBulletsUpdate();
            self.thumbsButtonsUpdate();

            return self;
        },
        thumbsGoForwards: function () {
            var self = this;
            var DOMIndex = self.state.galleryThumbs.currentDOMIndex + self.state.galleryThumbs.onPage;

            return self.thumbsGoTo(DOMIndex);
        },
        thumbsGoBackwards: function () {
            var self = this;
            var DOMIndex = self.state.galleryThumbs.currentDOMIndex - self.state.galleryThumbs.onPage;

            return self.thumbsGoTo(DOMIndex);
        },
        thumbsGoToBullet: function (bulletIndex) {
            var self = this;
            var targetIndex = (bulletIndex - 1) * self.state.galleryThumbs.onPage;

            self.thumbsGoTo(targetIndex);

            return self;
        },
        thumbsBindEvents: function () {
            var self = this;

            self.on('transitionend', self.params.galleryThumbs.thumbsListSelector, function (event) {
                event.stopPropagation();

                if ($(event.target).is(self.params.galleryThumbs.thumbsListSelector)) {
                    self.call(self.thumbsOnTransitionEnd);
                }
            });

            self.on('click', self.params.galleryThumbs.thumbsBackwardsSelector, function (event) {
                event.preventDefault();
                self.throttle('thumbsBackwards', self.thumbsGoBackwards);
            });

            self.on('click', self.params.galleryThumbs.thumbsForwardsSelector, function (event) {
                event.preventDefault();
                self.throttle('thumbsForwards', self.thumbsGoForwards);
            });

            self.on('click', self.params.galleryThumbs.thumbsBulletsSelector, function (event) {
                event.preventDefault();
                var $bullet = $(this);
                var bulletIndex = $bullet.data('index');
                self.throttle('thumbsForwards', function () {
                    self.thumbsGoToBullet(bulletIndex);
                });
            });

            self.on('click', self.params.galleryThumbs.thumbsSelector, function (event) {
                event.preventDefault();
                if (!self.state.galleryThumbs.isTransition && !self.state.galleryThumbs.preventClick) {
                    var $target = $(this);
                    var realIndex = $target.data('index');
                    var DOMIndex = self.state.currentDOMIndex + realIndex - self.state.currentRealIndex;

                    self.throttle('goTo', function () {
                        self.state.galleryThumbs.current = $target.get(0);
                        self.state.galleryThumbs.$current = $target;

                        self.goTo(DOMIndex);
                    });
                }
            });

            self.bind('resize', self.$WINDOW, function () {
                self.throttle('resizeThumbs', function () {
                    self.thumbsGoTo(self.state.galleryThumbs.targetDOMIndex, true);
                }, 15);
            });

            if (self.params.swipe) {
                if (self.hasPlugin('depotSwipe')) {
                    self.$thumbsViewport.depotSwipe({
                        targetSelector: self.params.galleryThumbs.thumbsListSelector,
                        touchThreshold: self.params.swipeThreshold,
                        mouse: true,
                        onStart: function (event) {
                            event.preventDefault();
                            self.state.galleryThumbs.preventClick = true;
                        },
                        onMove: function (event, swipe) {
                            event.preventDefault();

                            var $current = self.$thumbs.eq(self.state.galleryThumbs.targetDOMIndex);
                            var currentPosition = self.getItemPosition($current);
                            var delta = swipe.current.left - swipe.start.left;

                            if (delta !== 0) {
                                self.moveListToPositionLeft(self.$thumbsList, currentPosition + delta, self.state.galleryThumbs, true);
                            }
                        },
                        onEnd: function (event, swipe) {
                            event.preventDefault();
                            event.stopPropagation();

                            if (swipe.delta > 0) {
                                self.thumbsGoBackwards();
                            } else {
                                self.thumbsGoForwards();
                            }
                        },
                        onCancel: function (event, swipe) {
                            if (swipe.delta !== 0) {
                                self.state.galleryThumbs.preventClick = true;
                                var $target = self.$thumbs.eq(self.state.galleryThumbs.targetDOMIndex);
                                self.moveListToPositionLeft(self.$thumbsList, self.getItemPosition($target), self.state.galleryThumbs);
                            } else {
                                self.state.galleryThumbs.preventClick = false;
                            }
                        }
                    });
                }
            }

            return self;
        },
        initGalleryThumbs: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                // TODO: (mediaQueries) update values: onPage, bulletsQuantity
                var onPage = self.params.galleryThumbs.onPage;
                var clientWidth = document.documentElement.clientWidth;
                if (clientWidth >= 740) {
                    onPage = 3;
                }
                if (clientWidth >= 1420) {
                    onPage = 5;
                }
                var bulletsQuantity = Math.ceil(self.state.itemsQuantity / onPage);

                return $.extend(true, {}, this, {
                    galleryThumbs: {
                        $current: null,
                        current: null,
                        targetDOMIndex: 0,
                        currentDOMIndex: 0,
                        currentBulletIndex: 0,
                        direction: 0,
                        isTransition: false,
                        preventClick: false,
                        onPage: onPage,
                        bulletsQuantity: bulletsQuantity,
                        transitionDelay: null
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.state = self.getInitialState();

            self.params.onChange = self.proxyCallback(self.params.onChange, function (DOMIndex, force) {
                if (!force) {
                    self.thumbsUpdate();
                }
            });

            self.thumbsRender();
            self.thumbsGoTo(self.params.startFrom, true);
            self.thumbsUpdate();
            self.thumbsBindEvents();

            self.call(self.params.galleryThumbs.onInit);
        }
    };
}(jQuery));

/**
 * @name aria
 * @version 1.0.0
 * @author Виктор Дмитриевцев <v.dmitrievcev@designdepot.ru>
 * @see git@git.designdepot.ru:frontend/aria.git
 * @license MIT
 */

(function ($) {
    'use strict';

    $.fn.aria = function (name, value) {
        if (arguments.length && arguments.length > 1) {
            return this.each(function () {
                $.attr(this, 'aria-' + name, value);
            });
        } else {
            return $.attr(this.get(0), 'aria-' + name);
        }
    };

    $.fn.removeAria = function (name) {
        return this.each(function () {
            $.removeAttr(this, 'aria-' + name);
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        mapFeatures: {
            featuresSelector: '.js-map-features',
            featuresCloseSelector: '.js-map-features-close',
            featuresListSelector: '.js-map-features-list',
            featuresItemsSelector: '.js-map-features-item',
            featuresScrollbarSelector: '.js-map-features-scrollbar',
            featuresThumbSelector: '.js-map-features-thumb',
            featuresSearchSelector: '.js-map-features-search',
            featuresTemplate: '<div class="map__features features features_map ${featuresSelector|substr(1)}" aria-hidden="${hidden}">${featuresCloseTemplate}${featuresLabelTemplate}${featuresSearchTemplate}${featuresListTemplate}${featuresScrollbarTemplate}</div>',
            featuresCloseTemplate: '<button class="features__close ${featuresCloseSelector|substr(1)}" type="button" title="_{buttons.close}" aria-label="_{buttons.close}"></button>',
            featuresLabelTemplate: '#{if label}<div class="features__heading">${label|ft}</div>#{endif}',
            featuresSearchTemplate: '#{if searchParam}<form class="features__search ${featuresSearchSelector|substr(1)}"><div class="field field_default field_round js-form-field"><input class="field__element field__element_search" type="search" name="search" id="features_search_${id}" autocomplete="off" list="features_list_${id}"><datalist id="features_list_${id}">#{for city in cities}<option value="${city}">#{endfor}</datalist><label class="field__label js-form-field-label" for="features_search_${id}">_{features.search}</label><button class="field__button button button_field ${featuresSearchButtonSelector|substr(1)}" type="submit" title="_{buttons.search}" aria-label="_{buttons.search}"><span class="button__icon button__icon_search"></span></button></div></form>#{endif}',
            featuresListTemplate: '<div class="features__overflow"><div class="features__list ${featuresListSelector|substr(1)}">#{for item in items}${featuresItemsTemplate}#{endfor}</div></div>',
            featuresItemsTemplate: '<div class="features__item ${featuresItemsSelector|substr(1)}" data-id="${item.id}"><div class="features__city">${item.city|ft}</div><div class="features__label">${item.label|ft}</div><div class="features__address">${item.address|ft}</div>#{if item.phone|length}#{for phone in item.phone}<div class="features__phone"><a href="tel:${phone|normPhone}">${phone}</a></div>#{endfor}#{endif}</div>',
            featuresScrollbarTemplate: '<div class="features__scrollbar ${featuresScrollbarSelector|substr(1)}"><div class="features__thumb ${featuresThumbSelector|substr(1)}"></div></div>',
            externalParams: [],
            searchParam: '',
            onInit: null
        },
        dictionary: {
            buttons: {
                close: {
                    ru: 'Закрыть',
                    en: 'Close'
                },
                search: {
                    ru: 'Искать',
                    en: 'Search'
                }
            },
            features: {
                empty: {
                    ru: 'Нет элементов для отображения',
                    en: 'No items to display'
                },
                search: {
                    ru: 'Искать',
                    en: 'Search'
                }
            }
        }
    };

    $.mapFeaturesMixin = {
        renderMapFeatures: function (items) {
            var self = this;

            if (self.$features && self.$features.length) {
                self.state.mapFeatures.city = '';
                self.state.mapFeatures.isVisible = false;
                self.$features.remove();
            }

            var featuresContext = $.extend(true, self.cleanObject(self.params.mapFeatures), {
                id: self.hash,
                label: self.state.response && self.state.response.label || '',
                items: items,
                hidden: !self.state.mapFeatures.isVisible,
                cities: function () {
                    return items.reduce(function (cities, item) {
                        var city = item.city;
                        if (cities.indexOf(city) === -1) {
                            cities.push(city);
                        }
                        return cities;
                    }, []);
                },
                filters: {
                    normPhone: function (number) {
                        const numberParts = number.toString().split(/[^0-9]+доб[^0-9]+/i);
                        const phone = numberParts[0];
                        const extNumber = numberParts[1] && numberParts[1].replace(/[^0-9+]/g, '');
                        return phone ? phone
                            .replace(/^[8]/, '+7')
                            .replace(/[^0-9+]/g, '') + (extNumber ? ';ext=' + extNumber : '') : phone;
                    }
                }
            });

            var featuresHTML = self.format(self.params.mapFeatures.featuresTemplate, featuresContext);

            self.$viewport.append(featuresHTML);

            self.getElements(self.params.mapFeatures);

            self.updateMapFeaturesScrollbar();

            self.$featuresScrollbar.depotSwipe({
                targetSelector: self.params.mapFeatures.featuresThumbSelector,
                onStart: function (event, state) {
                    var featuresListScrollHeight = self.$featuresList.get(0).scrollHeight;
                    var featuresScrollbarHeight = self.$featuresScrollbar.height();
                    self.state.mapFeatures.featuresListScrollTop = self.$featuresList.scrollTop();
                    self.state.mapFeatures.featuresScrollbarScale = featuresListScrollHeight / featuresScrollbarHeight;
                },
                onMove: function (event, state) {
                    if (state.isActive) {
                        var featuresListScrollTop = self.state.mapFeatures.featuresListScrollTop;
                        var swipeDeltaTop = (state.current.top - state.start.top) * self.state.mapFeatures.featuresScrollbarScale;

                        self.$featuresList.scrollTop(featuresListScrollTop + swipeDeltaTop);

                        self.updateMapFeaturesScrollbar();
                    }
                }
            });

            self.$featuresSearch.depotForm({
                validation: false,
                onSubmit: function (event) {
                    if (event) {
                        event.preventDefault();
                    }

                    var form = this;
                    var formData = $.depotParse(form.state.formData);
                    var itemsQuantity = items.length;
                    var foundIndex = -1;

                    for (var index = 0; index < itemsQuantity; index++) {
                        var point = items[index];

                        if (point.city === formData.search) {
                            foundIndex = index;
                            break;
                        }
                    }

                    if (foundIndex !== -1) {
                        self.applyMapFeaturesCity(formData.search);

                        var $target = self.$featuresItems.eq(foundIndex);
                        self.$featuresList.animate({
                            scrollTop: $target.position().top + self.$featuresList.scrollTop()
                        }, {
                            step: function () {
                                self.triggerTo(self.$featuresList, 'update');
                            }
                        });
                    } else {
                        $.depotNotifications.info({
                            ru: 'Нет точек в выбранном городе, попробуйте поискать в соседних',
                            en: 'There are no points in the selected city, try searching in nearby'
                        });
                    }
                }
            });

            return self;
        },
        updateMapFeaturesScrollbar: function () {
            var self = this;

            if (self.$featuresList && self.$featuresList.length) {
                var featuresListHeight = self.$featuresList.height();
                var featuresListScrollHeight = self.$featuresList.get(0).scrollHeight;
                var featuresListScrollTop = self.$featuresList.scrollTop();
                var featuresThumbHeight = parseFloat((featuresListHeight / featuresListScrollHeight * 100).toFixed(6));
                var featuresThumbTop = parseFloat((featuresListScrollTop / featuresListHeight * 100).toFixed(6));

                self.$featuresThumb.css(self.prefixed({
                    height: featuresThumbHeight + '%',
                    transform: 'translate3d(0,' + featuresThumbTop + '%,0)'
                }));
            }

            return self;
        },
        getMapFeaturesParams: function () {
            var self = this;
            var hashObject = $.depotHash.toObject() || {};
            var mapFeaturesParams = self.cleanObject();

            self.params.mapFeatures.externalParams.forEach(function (paramName) {
                mapFeaturesParams[paramName] = hashObject[paramName];
            });

            return mapFeaturesParams;
        },
        updateMapFeaturesParams: function () {
            var self = this;
            var mapFeaturesParams = self.getMapFeaturesParams();

            $.extend(true, self.cleanObject(self.state.externalParams), mapFeaturesParams);
            return self;
        },
        showMapFeatures: function () {
            var self = this;

            self.state.mapFeatures.isVisible = true;
            self.$features.aria('hidden', 'false');

            return self;
        },
        applyMapFeaturesCity: function (city) {
            var self = this;

            self.state.mapFeatures.city = city;
            var cityPoints = self.cache.points.search('properties.city == "' + city + '"');
            if (!cityPoints.getLength()) {
                cityPoints = self.cache.points;
            }

            cityPoints.applyBoundsToMap(self.cache.map, {
                checkZoomRange: true,
                flying: false,
                useMapMargin: true
            }).then(function () {
                if (self.cache.map.getZoom() > self.params.mapOptions.zoom) {
                    self.cache.map.setZoom(self.params.mapOptions.zoom, {
                        checkZoomRange: true,
                        flying: false,
                        useMapMargin: true
                    });
                }
            });


            return self;
        },
        hideMapFeatures: function () {
            var self = this;

            self.state.mapFeatures.isVisible = false;
            self.$features.aria('hidden', 'true');
            self.deselectMapFeatures();
            self.applyMapFeaturesCity(self.state.mapFeatures.city);

            return self;
        },
        toggleMapFeature: function (featureId) {
            var self = this;

            var isCurrentlyActive = self.$featuresItems.filter('[data-id="' + featureId + '"]').hasClass(self.params.activeClassName);
            if (isCurrentlyActive) {
                self.deselectMapFeature(featureId);
            } else {
                self.selectMapFeature(featureId);
            }

            return self;
        },
        selectMapFeature: function (featureId) {
            var self = this;

            self.deselectMapFeatures();

            var $target = self.$featuresItems.filter('[data-id="' + featureId + '"]').addClass(self.params.activeClassName);
            var currentPoints = self.cache.points.search('properties.id == "' + featureId + '"').setProperties('isActive', true);

            if (currentPoints.getLength()) {
                var currentPoint = currentPoints.get(0);
                self.state.mapFeatures.city = currentPoint.properties.get('city');
                self.cache.map.setCenter(currentPoints.getCenter(self.cache.map, {useMapMargin: true, flying: true}));
                self.cache.map.setZoom(self.params.mapOptions.zoom);

                self.$featuresList.animate({
                    scrollTop: $target.position().top + self.$featuresList.scrollTop()
                }, {
                    step: function () {
                        self.triggerTo(self.$featuresList, 'update');
                    }
                });
            }

            if (!self.state.mapFeatures.isVisible) {
                self.showMapFeatures();
            }

            return self;
        },
        deselectMapFeature: function (featureId) {
            var self = this;

            self.$featuresItems.filter('[data-id="' + featureId + '"]').removeClass(self.params.activeClassName);
            self.cache.points.search('properties.id == "' + featureId + '"').setProperties('isActive', false);

            if (!self.cache.points.search('properties.isActive=true').getLength()) {
                self.hideMapFeatures();
            }

            return self;
        },
        deselectMapFeatures: function () {
            var self = this;

            self.$featuresItems.filter('.' + self.params.activeClassName).removeClass(self.params.activeClassName);
            self.cache.points.search('properties.isActive == true').setProperties('isActive', false);

            return self;
        },
        bindMapFeaturesEvents: function () {
            var self = this;

            self.on('map:points:ready', function (event, data) {
                self.renderMapFeatures(data.points);
            });

            self.on('click', self.params.mapFeatures.featuresCloseSelector, function (event) {
                event.preventDefault();
                self.debounce('hideMapFeatures', self.hideMapFeatures);
            });

            self.on('click', self.params.mapFeatures.featuresItemsSelector, function (event) {
                event.preventDefault();
                self.toggleMapFeature($(this).data('id'));
            });

            self.on('wheel update', self.params.mapFeatures.featuresListSelector, function (event) {
                self.updateMapFeaturesScrollbar();
            });

            self.bind('resize', self.$WINDOW, function () {
                self.updateMapFeaturesScrollbar();
            });

            $.depotHash.onChange(function () {
                self.throttle('hashChange', function () {
                    if (self.inViewport()) {
                        self.updateMapFeaturesParams();
                        self.getPoints();
                    }
                });
            });

            return self;
        },
        initMapFeatures: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, self.cleanObject(this), {
                    mapFeatures: {
                        city: '',
                        isVisible: document.documentElement.clientWidth >= 1420,
                        featuresListScrollTop: 0,
                        featuresScrollbarScale: 1
                    }
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.params.getExternalParams = self.proxyCallback(self.params.getExternalParams, function () {
                return $.extend(true, self.cleanObject(this), self.getMapFeaturesParams());
            });

            self.state = self.getInitialState();

            self.updateMapFeaturesParams();

            self.bindMapFeaturesEvents();

            self.call(self.params.mapFeatures.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';

    function MapWrapper(container, settings) {
        var self = this;

        return self.call(self._init, container, settings);
    }

    MapWrapper.prototype = $.extend(true, {}, $.depotProto, {
        pluginName: 'mapWrapper',

        defaults: {
            viewportSelector: '.js-map-viewport',
            canvasSelector: '.js-map-canvas',
            processingClassName: 'is-processing',
            errorClassName: 'is-error',
            centerParam: 'center',
            lazy: true,
            empty: false,
            mapOptions: {
                zoom: 16
            },
            ajax: {
                type: 'GET'
            },
            setPointsSilent: false,
            placeMark: {
                preset: 'islands#redDotIcon'
            },
            center: '55.721184, 37.652292',
            marginAreas: [
                {top: 0, left: 0, width: '100%', height: 10},
                {bottom: 0, left: 0, width: '100%', height: 10},
                {left: 0, top: 0, width: 10, height: '100%'},
                {right: 0, top: 0, width: 10, height: '100%'}
            ],
            debug: false,
            cache: {
                type: 'session',
                expires: '15m'
            },
            processPoint: null,
            getExternalParams: null,
            getFeatureCollection: null,
            onReady: null,
            onResize: null,
            onPointClick: null
        },

        getInitialState: function () {
            var self = this;
            var data = self.$container.data() || {};
            return {
                request: null,
                apiKey: data.apiKey,
                center: self.toCoordinates(data[self.params.centerParam] || self.params.center),
                setPointsSilent: self.params.setPointsSilent,
                externalParams: self.cleanObject()
            };
        },

        inViewport: function () {
            var self = this;

            // TODO: вытащить в плагин
            function _isVisible($el) {
                return $el.css('display') !== 'none' && window.getComputedStyle($el.get(0)).visibility !== 'hidden';
            }

            var documentVisible = document.visibilityState !== 'hidden';
            if (!documentVisible) {
                return false;
            }

            var containerVisible = _isVisible(self.$container);
            if (!containerVisible) {
                return false;
            }

            self.$container.parents().each(function (i, el) {
                if (!_isVisible($(el))) {
                    containerVisible = false;
                }

                return containerVisible;
            });

            if (!containerVisible) {
                return false;
            }

            var $sticky = $('js-sticky');
            var stickyHeight = 0;
            $sticky.each(function (i, stickyElement) {
                stickyHeight += $(stickyElement).outerHeight();
            });

            var containerTop = self.$container.offset().top;
            var containerBottom = containerTop + self.$container.outerHeight(true);
            var windowTop = self.$WINDOW.scrollTop() + stickyHeight;
            var windowBottom = windowTop + self.$WINDOW.innerHeight();

            var isAboveViewport = containerBottom < windowTop;
            var isUnderViewport = containerTop > windowBottom;

            return !(isAboveViewport || isUnderViewport);
        },

        loadStart: function () {
            var self = this;
            if (self.params.debug) {
                console.time(self.eventNameSpace);
            }
            self.$container.removeClass(self.params.errorClassName);
            self.$container.addClass(self.params.processingClassName);

            return self;
        },

        loadEnd: function () {
            var self = this;

            self.$container.removeClass(self.params.processingClassName);
            if (self.params.debug) {
                console.timeEnd(self.eventNameSpace);
            }

            return self;
        },

        loadFail: function () {
            var self = this;

            self.$container.removeClass(self.params.processingClassName);
            self.$container.addClass(self.params.errorClassName);
            $.depotNotifications.warn({
                ru: 'Карта: что-то пошло не так. Попробуйте обновить страницу или вернуться позже.',
                en: 'Map: something went wrong. Try refreshing the page or come back later.'
            });
            if (self.params.debug) {
                console.timeEnd(self.eventNameSpace);
            }

            return self;
        },

        checkViewportLoadAPI: function () {
            var self = this;
            var apiStates = [
                'loading',
                'initializing',
                'initialized',
                'ready'
            ];
            var apiRequested = apiStates.indexOf(self.state.api) !== -1;
            var inViewport = self.inViewport();
            if (!apiRequested && inViewport) {
                self.loadAPI();

                self.unbind('', 'viewport', self.$WINDOW);
                self.unbind('', 'viewport', self.$DOCUMENT);

                if (!self.params.empty) {
                    self.getPoints();
                }
            }

            return self;
        },

        loadAPI: function () {
            var self = this;

            self.state.api = 'loading';
            self.loadStart();
            var apiURL = self.format('https://api-maps.yandex.ru/2.1/?#{if apiKey}apikey=${apiKey}&#{endif}lang=${lang}', {
                apiKey: self.state.apiKey,
                lang: self.LANGUAGE
            });

            self.addScripts({src: apiURL, exports: 'ymaps'}, function (error) {
                if (error) {
                    self.loadFail();
                    self.call(self.params.onError, error);
                } else {
                    self.initAPI();
                }
            });

            return self;
        },

        initAPI: function () {
            var self = this;

            self.wait('initAPI', function () {
                if (window.ymaps && self.state.api === 'loading') {
                    self.state.api = 'initializing';
                    try {
                        window.ymaps.ready(function () {
                            self.state.api = 'initialized';
                        });
                    } catch (error) {
                        self.error({
                            action: 'MapWrapper.initAPI',
                            data: {
                                error: error
                            },
                            name: error.text,
                            number: error.number,
                            message: error.message
                        });
                    }
                }

                return self.state.api === 'initialized';
            }, function () {
                self.state.api = 'ready';
                self.$container.trigger('map:ready:api');

                self.drawMap();
                self.setPoints(self.cache.pointsArray, self.state.setPointsSilent);
            });

            return self;
        },

        loadPoints: function (pointsUrl, urlHash) {
            var self = this;
            var requestData = $.param(self.state.externalParams, true);

            if (!self.state.request) {
                self.state.request = $.ajax({
                    url: pointsUrl,
                    type: self.params.ajax.type,
                    dataType: 'json',
                    data: requestData,
                    success: function (response) {
                        self.state.request = null;
                        if (response && response.success) {
                            self.state.points = 'loaded';
                            self.state.response = response;
                            self.setPoints(response.points);

                            if (self.params.cache && !self.DEBUG) {
                                $.depotStorage.setItem('mapResponse-' + urlHash, response, self.params.cache);
                            }
                        } else {
                            self.state.points = 'empty';
                            self.$container.trigger('points:error');
                            self.error({
                                action: 'MapWrapper.loadPoints',
                                data: {
                                    url: pointsUrl,
                                    data: requestData,
                                    response: response
                                },
                                name: 'Error',
                                number: 0,
                                message: response.error || 'Неожиданный ответ сервера'
                            });
                        }
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        self.state.points = 'empty';
                        self.$container.trigger('points:error');
                        self.error({
                            action: 'MapWrapper.loadPoints',
                            data: {
                                url: pointsUrl,
                                data: requestData,
                            },
                            name: textStatus,
                            number: jqXHR.status,
                            message: errorThrown
                        });
                    }
                });
            }

            return self;
        },

        getPoints: function () {
            var self = this;
            self.state.points = 'loading';
            self.state.externalParams = $.extend(true, self.cleanObject(self.state.externalParams), self.call(self.params.getExternalParams));

            var sourceData = self.$container.data();
            var pointsArray = sourceData['pointsArray'];
            var pointsVar = sourceData['pointsVar'];
            var pointsUrl = sourceData['pointsUrl'];

            if (pointsArray && self.getType(pointsArray) === 'array') {
                self.info('--debug', '::getPoints', 'Источник: pointsArray', pointsArray);
                self.setPoints(pointsArray);
                self.state.points = 'loaded';
            } else if (pointsVar && window[pointsVar]) {
                self.info('--debug', '::getPoints', 'Источник: pointsVar', pointsVar);
                self.setPoints(window[pointsVar]);
                self.state.points = 'loaded';
            } else if (pointsUrl && typeof pointsUrl === 'string' && pointsUrl.length) {
                var externalHash = $.depotParse(self.state.externalParams, {reverse: true});
                var urlHash = pointsUrl + '?' + externalHash;
                self.info('--debug', '::getPoints', 'Источник: pointsUrl', urlHash);
                if (self.params.cache && !self.DEBUG) {
                    var cachedResponse = $.depotStorage.getItem('mapResponse-' + urlHash, self.params.cache.type);

                    if (cachedResponse && typeof cachedResponse === 'object') {
                        self.state.points = 'loaded';
                        self.state.response = cachedResponse;
                        self.setPoints(cachedResponse.points);
                    } else {
                        self.loadPoints(pointsUrl, urlHash);
                    }
                } else {
                    self.loadPoints(pointsUrl, urlHash);
                }
            } else {
                self.state.points = 'empty';
                self.warn('::getPoints', 'Не удалось получить данные');
            }

            return self;
        },

        toCoordinates: function toCoordinates(source) {
            var self = this;
            var coordinates = [];
            var sourceType = self.getType(source);
            try {
                if (sourceType === 'string') {
                    if (source.indexOf(';') !== -1) {
                        $.each(source.split(/;\s*/), function (i, coordinate) {
                            coordinates.push(coordinate.split(/,\s*/));
                        });
                    } else {
                        coordinates = source.split(/,\s*/);
                    }
                } else if (sourceType === 'object') {
                    coordinates = [source.lat || source.latitude, source.lon || source.longitude];
                } else if (sourceType === 'array') {
                    coordinates = source;
                }
            } catch (error) {
                self.error({
                    action: 'MapWrapper.toCoordinates',
                    data: {
                        source: source,
                    },
                    name: error.name,
                    number: error.number,
                    message: error.message
                });
            }

            return coordinates;
        },

        normalizePoint: function (sourcePoint) {
            var self = this;
            var point = {};
            var sourceType = self.getType(sourcePoint);

            if (sourceType === 'string') {
                point = {
                    coordinates: sourcePoint
                };
            } else if (sourceType === 'array') {
                point = {
                    coordinates: sourcePoint
                };
            } else if (sourceType === 'object') {
                point = sourcePoint;
            }

            if (self.getType(self.params.processPoint) === 'function') {
                point = self.call(self.params.processPoint, point);
            }

            return point;
        },

        getFeatureCollection: function (pointsArray) {
            var self = this;

            var features = [];

            $.each(pointsArray, function (i, sourcePoint) {
                var point = self.normalizePoint(sourcePoint);
                var coordinates = self.toCoordinates(point.coordinates);
                var featureOptions = typeof self.params.placeMark === 'function' ? self.call(self.params.placeMark, window.ymaps) : self.params.placeMark;

                features.push({
                    type: 'Feature',
                    properties: point,
                    geometry: {
                        type: 'Point',
                        coordinates: coordinates
                    },
                    options: featureOptions
                });
            });

            return window.ymaps.geoQuery({
                type: 'FeatureCollection',
                features: features
            });
        },

        setPoints: function (pointsArray, silent) {
            var self = this;

            if (silent !== undefined) {
                self.state.setPointsSilent = silent;
            }

            self.cache.pointsArray = pointsArray;

            if (!pointsArray || !pointsArray.length) {
                self.clearMap();

                if (!self.params.empty) {
                    self.warn('setPoints: Нет данных для отображения');
                }
            } else {
                self.wait('setPoints', function () {
                    var apiReady = self.state.api === 'ready';
                    var mapReady = self.state.map === 'ready';

                    return apiReady && mapReady;
                }, function () {
                    var features = self.call(self.params.getFeatureCollection, self.cache.pointsArray);

                    if (!features) {
                        features = self.getFeatureCollection(self.cache.pointsArray);
                    }

                    if (self.cache.points) {
                        self.cache.points.removeFromMap(self.cache.map);
                    }

                    self.cache.points = features;

                    if (!self.state.setPointsSilent) {
                        self.cache.points.addToMap(self.cache.map);

                        self.centerMap();
                    }

                    self.cache.points.addEvents('click', function (event) {
                        self.call(self.params.onPointClick, event);
                    });

                    self.cache.visiblePoints = self.cache.points;
                    self.state.points = 'ready';
                    self.pubPoints(pointsArray);
                }, true);
            }

            return self;
        },

        addPoints: function (pointsArray, silent) {
            var self = this;
            var params = {
                silent: false,
                add: true
            };

            if (silent !== undefined) {
                if (typeof silent === 'object') {
                    params.silent = silent.silent !== undefined ? silent.silent : params.silent;
                    params.add = silent.add !== undefined ? silent.add : params.add;
                } else {
                    params.silent = silent;
                }
            }

            self.state.setPointsSilent = params.silent;

            if (params.add) {
                self.cache.pointsArray = self.cache.pointsArray.concat(pointsArray);
            }

            if (!pointsArray || !pointsArray.length) {
                self.clearMap();

                if (!self.params.empty) {
                    self.warn('addPoints: Нет данных для отображения');
                }
            } else {
                self.wait('addPoints', function () {
                    var apiReady = self.state.api === 'ready';
                    var mapReady = self.state.map === 'ready';

                    return apiReady && mapReady;
                }, function () {
                    var features = self.call(self.params.getFeatureCollection, pointsArray);

                    if (!features) {
                        features = self.getFeatureCollection(pointsArray);
                    }

                    self.cache.points = self.cache.points.add(features);

                    if (!self.state.setPointsSilent) {
                        self.cache.visiblePoints = self.cache.visiblePoints.add(features);
                        features.addToMap(self.cache.map);

                        self.centerMap();
                    }

                    features.addEvents('click', function (event) {
                        self.call(self.params.onPointClick, event);
                    });

                    self.state.points = 'ready';
                    self.pubPoints(pointsArray);
                });
            }

            return self;
        },

        clearMap: function () {
            var self = this;

            if (self.state.points === 'ready' && self.cache.points) {
                self.cache.points.removeFromMap(self.cache.map);
                self.cache.map.setCenter(self.state.center, {useMapMargin: true});
                self.cache.map.setZoom(self.params.mapOptions.zoom, {useMapMargin: true});
                self.state.points = 'empty';
            }

            if (self.params.empty) {
                self.$container.trigger('map:empty');
            }

            return self;
        },

        drawMap: function () {
            var self = this;

            self.wait('drawMap', function (abort) {
                return self.state.api === 'ready';
            }, function () {
                self.cache.map = new window.ymaps.Map(self.$canvas.get(0), $.extend(true, {
                    zoom: self.params.mapOptions.zoom,
                    center: self.state.center,
                    behaviors: [
                        'drag',
                        'dblClickZoom',
                        'multiTouch'
                    ],
                    controls: []
                }, self.params.mapOptions));

                if (self.params.marginAreas && self.params.marginAreas.length) {
                    $.each(self.params.marginAreas, function (i, area) {
                        self.cache.map.margin.addArea(area);
                    });
                }

                self.state.map = 'ready';
                self.$container.trigger('map:ready');
                self.loadEnd();

                self.call(self.params.onReady);
            });

            return self;
        },

        centerMap: function (target) {
            var self = this;

            self.wait('centerMap', function (abort) {
                var apiReady = self.state.api === 'ready';
                var pointsReady = self.state.points === 'ready';
                var mapReady = self.state.map === 'ready';

                if (self.state.points === 'empty') {
                    abort();
                }

                return apiReady && mapReady && pointsReady;
            }, function () {
                var points = self.cache.visiblePoints;

                if (target) {
                    points = target;
                }

                if (points && points.getLength !== undefined) {
                    points.applyBoundsToMap(self.cache.map, {
                        checkZoomRange: true,
                        flying: false,
                        useMapMargin: true
                    }).then(function () {
                        if (self.cache.map.getZoom() > self.params.mapOptions.zoom) {
                            self.cache.map.setZoom(self.params.mapOptions.zoom, {
                                checkZoomRange: true,
                                flying: false,
                                useMapMargin: true
                            });
                        }
                    });
                } else {
                    self.warn('centerMap: Нет данных для отображения');
                }
            });

            return self;
        },

        pubPoints: function (points) {
            var self = this;

            self.$container.trigger('map:points:ready', {points: points});

            return self;
        },

        bindEvents: function () {
            var self = this;

            self.bind('scroll resize', self.$WINDOW, function () {
                self.throttle('scroll', function () {
                    if (self.state.map === 'ready') {
                        self.call(self.params.onResize);
                    }
                });
            });

            if (self.params.lazy) {
                self.bind('scroll resize hashchange', 'viewport', self.$WINDOW, function (event) {
                    self.throttle('viewport-scroll', function () {
                        self.delay(self.checkViewportLoadAPI, 500);
                    });
                });

                self.bind('click visibilitychange', 'viewport', self.$DOCUMENT, function (event) {
                    self.throttle('visibilitychange', self.checkViewportLoadAPI);
                });
            }

            self.$container.on('map:reload', function (event, data) {
                self.throttle('map:reload', function () {
                    var externalParams;
                    var extend;
                    if (data) {
                        if (data.silent !== undefined) {
                            self.state.setPointsSilent = data.silent;
                        }
                        if (data.externalParams !== undefined && typeof data.externalParams === 'object') {
                            externalParams = data.externalParams;
                            extend = data.extend;
                        }
                    }

                    if (externalParams) {
                        if (extend) {
                            self.state.externalParams = $.extend(true, {}, self.state.externalParams, externalParams);
                        } else {
                            self.state.externalParams = externalParams;
                        }
                    }

                    self.getPoints();
                });
            });

            self.$container.on('map:clear', function (event) {
                self.throttle('map:clear', function () {
                    self.clearMap();
                });
            });

            self.$container.on('map:zoomIn', function () {
                if (self.state.map === 'ready') {
                    self.cache.map.setZoom(self.cache.map.getZoom() + 1);
                }
            });

            self.$container.on('map:zoomOut', function () {
                if (self.state.map === 'ready') {
                    self.cache.map.setZoom(self.cache.map.getZoom() - 1);
                }
            });

            self.$container.on('map:zoomTo', function (event, data) {
                var zoom = event.zoom || data.zoom;
                if (self.state.map === 'ready' && zoom !== undefined) {
                    self.cache.map.setZoom(zoom);
                }
            });

            return self;
        },

        init: function () {
            var self = this;

            if (self.params.lazy) {
                self.delay(self.checkViewportLoadAPI);
            } else {
                self.loadAPI();

                if (!self.params.empty) {
                    self.getPoints();
                }
            }

            self.call(self.params.onInit);

            return self;
        }
    });

    $.fn.mapWrapper = function (settings) {
        return this.each(function (i, container) {
            $.data(container, 'mapWrapper', new MapWrapper(container, settings));
        });
    };
}(jQuery));

(function ($) {
    'use strict';

    var MIXIN_DEFAULTS = {
        popupVariants: {
            variantsSelector: '.js-popup-variant',
            variantToggleSelector: '.js-popup-variant-toggle',
            dataParam: 'variant',
            defaultVariant: false,
            redirects: {},
            beforeShowPopupVariant: null,
            onShowPopupVariant: null,
            onHidePopupVariant: null,
            onInit: null,
            getInitialState: null
        }
    };

    $.popupVariantsMixin = {
        updatePopupVariant: function () {
            var self = this;
            var variantId;

            if (self.params.useHash) {
                var hashRe = new RegExp('^' + self.params.popupVariants.dataParam + '=(.*)$', 'i');
                var hashParams = $.depotParse($.depotHash.getMatched(hashRe));

                if (hashParams) {
                    variantId = hashParams[self.params.popupVariants.dataParam];
                    if (variantId !== undefined) {
                        if (self.state.popupVariants.currentVariantId !== variantId) {
                            self.showPopupVariant(variantId);
                        }
                    } else {
                        self.hide();
                    }
                } else {
                    self.hide();
                }
            }

            return self;
        },

        showPopupVariant: function (variantId) {
            var self = this;
            var defaultPrevented = self.call(self.params.popupVariants.beforeShowPopupVariant, variantId);

            if (!defaultPrevented && $.depotHash.has(self.state.hash)) {
                var matchedQuantity = 0;
                self.$variants.each(function (i, variant) {
                    var $variant = $(variant);
                    var currentId = $variant.data(self.params.popupVariants.dataParam);
                    var isMatched = currentId !== undefined && variantId !== undefined && currentId.toString() === variantId.toString();

                    if (isMatched) {
                        matchedQuantity += 1;
                        self.state.popupVariants.currentVariantId = variantId;
                        self.call(self.params.popupVariants.onShowPopupVariant, variant, currentId);
                    } else if (!isMatched && !$variant.attr('hidden')) {
                        if (self.state.popupVariants.currentVariantId === currentId) {
                            self.state.popupVariants.currentVariantId = undefined;
                        }
                        $variant.find('form').trigger('reset');
                        self.call(self.params.popupVariants.onHidePopupVariant, variant, currentId);
                    }

                    $variant.attr('hidden', !isMatched);
                });

                if (!matchedQuantity) {
                    if (self.params.popupVariants.redirects[variantId]) {
                        self.info('--debug', 'Вариант %s не найден, но есть редирект, переадресация на %s', variantId, self.params.popupVariants.redirects[variantId]);
                        self.showPopupVariant(self.params.popupVariants.redirects[variantId]);
                    } else if (self.params.popupVariants.defaultVariant && variantId !== self.params.popupVariants.defaultVariant) {
                        self.info('--debug', 'Вариант %s не найден, переадресация на дефолтный', variantId);
                        self.showPopupVariant(self.params.popupVariants.defaultVariant);
                    } else {
                        self.info('--debug', 'Вариант %s не найден', variantId);
                        self.hide();
                    }
                }
            }

            return self;
        },

        initPopupVariants: function () {
            var self = this;

            self.getInitialState = self.proxyCallback(self.getInitialState, function () {
                return $.extend(true, {}, this, {
                    popupVariants: {}
                });
            });

            self.params = $.extend(true, {}, self.translate(MIXIN_DEFAULTS), self.params);

            self.getElements(self.params.popupVariants);

            self.state = self.getInitialState();

            self.show = self.proxyCallback(self.show, function () {
                self.debounce('update', self.updatePopupVariant);
            });

            self.params.beforeHide = self.proxyCallback(self.params.beforeHide, function () {
                self.$variants.each(function (i, variant) {
                    var $variant = $(variant);
                    var variantId = $variant.data(self.params.popupVariants.dataParam);

                    if (self.state.popupVariants.currentVariantId === variantId) {
                        $variant.attr('hidden', true);
                        $variant.find('form').trigger('reset');

                        var hashParamRe = new RegExp(self.format('^${paramName}=${value}$', {
                            paramName: self.params.popupVariants.dataParam,
                            value: self.state.popupVariants.currentVariantId
                        }), 'i');

                        $.depotHash.removeMatched(hashParamRe);

                        self.call(self.params.popupVariants.onHidePopupVariant, variant, variantId);
                    }
                });
            });

            self.params.onHashChange = self.proxyCallback(self.params.onHashChange, function () {
                self.debounce('update', self.updatePopupVariant);
            });

            self.on('click', self.params.popupVariants.variantToggleSelector, function (event) {
                event.preventDefault();

                var $variantToggle = $(this);
                self.debounce('variant', function () {
                    var variantId = $variantToggle.data('id');
                    self.showPopupVariant(variantId);
                });
            });

            self.on('variant:show', function (event, data) {
                self.debounce('variant', function () {
                    if (event && data && data[self.params.popupVariants.dataParam]) {
                        var variantId = data[self.params.popupVariants.dataParam];
                        self.showPopupVariant(variantId);
                    }
                });
            });

            self.call(self.params.popupVariants.onInit);
        }
    };
}(jQuery));

(function ($) {
    'use strict';
    $(function () {
        var VENDOR_PATH = 'local/templates/grunwald/vendor';

//===========================
// Фиксация высоты окна
//===========================
        $.depotProto.$WINDOW.on('load resize init:vars', function (event) {
            document.documentElement.style.setProperty('--vh', document.documentElement.clientHeight * .01 + 'px');
            document.documentElement.style.setProperty('--vw', document.documentElement.clientWidth * .01 + 'px');
        }).trigger('init:vars');

//===========================
// Регистрация serviceWorker
//===========================
        $.depotProto.delay(function () {
            // if ('serviceWorker' in navigator && navigator.serviceWorker !== null) {
            //     var webp = Modernizr && !!Modernizr.webp;
            //     var retina = window.devicePixelRatio && window.devicePixelRatio > 1;
            //     navigator.serviceWorker.register('/service-worker.min.js?retina=' + retina + '&webp=' + webp);
            // }

            $.depotProto.$WINDOW.on('online', function () {
                if (document.visibilityState && document.visibilityState === 'visible') {
                    $.depotNotifications.info({
                        ru: 'Подключение к сети восстановлено.',
                        en: 'Network connection has been restored.'
                    });

                    if ($('.js-offline').length && !location.pathname.match(/\/offline\//)) {
                        window.location.reload();
                    }
                }
            });

            $.depotProto.$WINDOW.on('offline', function () {
                if (document.visibilityState && document.visibilityState === 'visible') {
                    $.depotNotifications.warn({
                        ru: 'Проверьте подключение к сети.',
                        en: 'Check your network connection.'
                    });
                }
            });
        });

//===========================
// Object-fit polyfill
//===========================
        if (window.Modernizr && !Modernizr.objectfit) {
            $.depotProto.addScripts({
                src: VENDOR_PATH + '/objectFitImages.min.js',
                exports: 'objectFitImages',
            }, function (error) {
                if (!error) {
                    window.objectFitImages(null, {watchMQ: true});
                }
            });
        }

//===========================
// Ленивые картинки
//===========================
        $('[loading="lazy"]').depotLazy();
        $.depotProto.$DOCUMENT.on('lazy:added', function (event, settings) {
            var $target = $(event.target);
            var $lazy;

            if ($target.is('[loading="lazy"]')) {
                $lazy = $target;
            } else {
                $lazy = $target.find('[loading="lazy"]');
            }

            if ($lazy && $lazy.length) {
                $lazy.depotLazy(settings);
            }
        });

//===========================
// Клик по карточке
//===========================
        $.depotProto.$BODY.on('click', '[data-clickable]', function (event) {
            var $target = $(event.target);
            var link = $(this).find('a').get(0);
            if (!$target.closest('a, button').length || $target.is(link)) {
                if (link) {
                    var cleanLocationHref = location.href.replace(location.hash, '');
                    var cleanLinkHref = link.href.replace(link.hash, '');
                    var linkHash = $.depotHash.get(link);
                    var isBlank = event.ctrlKey || event.metaKey;

                    if (linkHash !== undefined && cleanLinkHref === cleanLocationHref && !isBlank) {
                        event.preventDefault();
                        $.depotHash.add(linkHash);
                    } else if (!$target.is(link)) {
                        var originalTarget = link.target;

                        if (isBlank) {
                            link.target = '_blank';
                        }

                        link.click();
                        link.target = originalTarget;
                    }
                }
            }
        });

//===========================
// Фиксация шапки
//===========================
        $('.js-header').fixHeader({
            mediaQuery: 'screen and (min-width: 1000px)'
        });

//===========================
// Раскрывашки меню
//===========================
        $('.js-level').depotLevel();

//===========================
// Раскрывашка в попап
//===========================
        $('.js-dropdown-popup').depotDropdown({
            kickOff: true
        });

//===========================
// Карусель на главной
//===========================
        $('.js-carousel-banner').depotGallery({
            viewportSelector: '.js-carousel-viewport',
            listSelector: '.js-carousel-list',
            itemsSelector: '.js-carousel-item',
            ratio: 502 / 1440,
            mixins: [
                $.galleryNavigationMixin,
                $.galleryRotationMixin
            ],
            galleryNavigation: {
                template: '<div class="carousel__navigation">${buttonBackwardsTemplate}${buttonForwardsTemplate}</div>${bulletsTemplate}',
                buttonBackwardsTemplate: '<button class="carousel__button carousel__button_backwards ${backwardsSelector|substr(1)}" type="button" aria-label="_{buttons.backwards}" title="_{buttons.backwards}"#{if backwardsDisabled} disabled#{endif}></button>',
                buttonForwardsTemplate: '<button class="carousel__button carousel__button_forwards ${forwardsSelector|substr(1)}" type="button" aria-label="_{buttons.forwards}" title="_{buttons.forwards}"#{if forwardsDisabled} disabled#{endif}></button>',
                bulletsTemplate: '#{if showNavigation}<div class="carousel__bullets">#{for bullet in 1..${bullets}}${bulletTemplate}#{endfor}</div>#{endif}',
                bulletTemplate: '<button class="carousel__bullet ${bulletsSelector|substr(1)}" type="button" data-index="${bullet}"></button>',
                backwardsSelector: '.js-carousel-backwards',
                forwardsSelector: '.js-carousel-forwards',
                bulletsSelector: '.js-carousel-bullet',
            },
            galleryRotation: {
                delay: 12000
            },
            beforeInit: function () {
                var self = this;

                self.initGalleryNavigation();
                self.initGalleryRotation();

                return self;
            }
        });

//===========================
// Карта стандартная
//===========================
        $('.js-map-default').mapWrapper({
            lazy: true,
            placeMark: function (ymaps) {
                var iconTemplate = '<div class="map__marker"></div>';
                var iconLayout = ymaps.templateLayoutFactory.createClass(iconTemplate);
                return {
                    preset: 'islands#greenIcon',
                    iconLayout: iconLayout,
                    iconShape: {
                        type: 'Polygon',
                        coordinates: [
                            [[0, 0], [-15, -20], [-15, -40], [15, -40], [15, -20]]
                        ]
                    }
                };
            }
        });

//===========================
// Карта Производство в контактах
//===========================
        $('.js-map-production').mapWrapper({
            lazy: true,
            cache: false,
            mapOptions: {
                controls: ['zoomControl']
            },
            marginAreas: [
                {top: 0, left: 0, width: '100%', height: 10},
                {bottom: 0, left: 0, width: '100%', height: 10},
                {left: 0, top: 0, width: '25%', height: '100%'},
                {right: 0, top: 0, width: '25%', height: '100%'}
            ],
            placeMark: function (ymaps) {
                var iconTemplate = '<div class="map__marker{% if properties.isActive %} is-active{% endif %}"></div>';
                var iconLayout = ymaps.templateLayoutFactory.createClass(iconTemplate);
                return {
                    preset: 'islands#greenIcon',
                    iconLayout: iconLayout,
                    iconShape: {
                        type: 'Polygon',
                        coordinates: [
                            [[0, 0], [-9, -12], [-9, -24], [9, -24], [9, -12]]
                        ]
                    }
                };
            },
            mixins: [
                $.mapFeaturesMixin
            ],
            mapFeatures: {},
            beforeInit: function () {
                var self = this;
                self.initMapFeatures();
            },
            processPoint: function (point) {
                var self = this;
                point.id = point.coordinates.replace(/[^0-9]/g, '');

                return point;
            },
            onPointClick: function (event) {
                var self = this;
                var targetId = event.get('target').properties.get('id');
                self.toggleMapFeature(targetId);
            }
        });

//===========================
// Карта Сервисная служба в контактах
//===========================
        $('.js-map-customer-service').mapWrapper({
            lazy: true,
            empty: true,
            cache: false,
            marginAreas: [
                {top: 0, left: 0, width: '100%', height: 10},
                {bottom: 0, left: 0, width: '100%', height: 10},
                {left: 0, top: 0, width: '25%', height: '100%'},
                {right: 0, top: 0, width: '25%', height: '100%'}
            ],
            placeMark: function (ymaps) {
                var iconTemplate = '<div class="map__marker{% if properties.isActive %} is-active{% endif %}"></div>';
                var iconLayout = ymaps.templateLayoutFactory.createClass(iconTemplate);
                return {
                    preset: 'islands#greenIcon',
                    iconLayout: iconLayout,
                    iconShape: {
                        type: 'Polygon',
                        coordinates: [
                            [[0, 0], [-9, -12], [-9, -24], [9, -24], [9, -12]]
                        ]
                    }
                };
            },
            mixins: [
                $.mapFeaturesMixin
            ],
            mapFeatures: {
                searchParam: 'city',
                externalParams: ['source']
            },
            dictionary: {
                features: {
                    search: {
                        ru: 'Город',
                        en: 'City'
                    }
                }
            },
            beforeInit: function () {
                var self = this;
                self.initMapFeatures();
            },
            processPoint: function (point) {
                var self = this;
                point.id = point.coordinates.replace(/[^0-9]/g, '');

                return point;
            },
            onPointClick: function (event) {
                var self = this;
                var targetId = event.get('target').properties.get('id');
                self.toggleMapFeature(targetId);
            }
        });

//===========================
// Календарь ленты новостей
//===========================
        $('.js-title-calendar').depotCalendar({
            template: '${beforeTemplate}<div class="calendar__viewport js-calendar-viewport">${monthPickerGridTemplate}</div>${afterTemplate}',
            beforeTemplate: '<div class="calendar__before">${buttonBackwardsTemplate}${buttonForwardsTemplate}${yearTemplate}</div>',
            afterTemplate: '<div class="calendar__after">${monthPickerApplyTemplate}</div>',
            mixins: [
                $.calendarNavigationMixin,
                $.calendarMonthPickerMixin
            ],
            calendarNavigation: {
                step: 'year'
            },
            calendarMonthPicker: {
                onApply: function () {
                    var self = this;
                    var locationSearch = $.depotParse(window.location.search);

                    var searchParams = $.extend(locationSearch, {
                        year: self.state.calendarMonthPicker.year,
                        month: self.state.calendarMonthPicker.month
                    });

                    window.location.search = $.depotParse(searchParams, {reverse: true});
                }
            },
            beforeInit: function () {
                var self = this;

                self.initCalendarNavigation();
                self.initCalendarMonthPicker();

                return self;
            }
        });

//===========================
// Ленивая подгрузка новостей
//===========================
        $('.js-feed-news').depotLoaderMore({
            targetSelector: '.js-feed-list',
            itemsSelector: '.js-feed-item',
            buttonSelector: '.js-feed-button',
            pageParam: 'PAGEN_1',
            onSuccess: function (response) {
                var self = this;

                if (response) {
                    var $items = $(response).find(self.params.itemsSelector);
                    self.$target.append($items);
                    $('[loading="lazy"]', self.$target).trigger('lazy:added');
                }

                return self;
            }
        });

//===========================
// Ленивая подгрузка поиска
//===========================
        $('.js-feed-search').depotLoaderMore({
            targetSelector: '.js-feed-list',
            itemsSelector: '.js-feed-item',
            buttonSelector: '.js-feed-button',
            pageParam: 'PAGEN_1',
            onSuccess: function (response) {
                var self = this;

                if (response) {
                    self.$target.append(response);
                    $('[loading="lazy"]', self.$target).trigger('lazy:added');
                }

                return self;
            }
        });

//===========================
// Заголовок новостей
//===========================
        $.depotSandbox('.js-title-news', {
            filterSelector: '.js-title-filter',
            filterToggleSelector: '.js-title-filter-toggle',
            filterButtonsSelector: '.js-title-filter-button',
            extend: {
                getInitialState: function () {
                    var self = this;
                    return {
                        filterHidden: true
                    };
                },
                filterApply: function ($button) {
                    var self = this;

                    var locationSearch = $.depotParse(window.location.search);
                    var searchParams = $.extend(locationSearch, $button.data());

                    window.location.search = $.depotParse(searchParams, {reverse: true, empty: false});

                    return self;
                },
                filterToggle: function () {
                    var self = this;

                    self.state.filterHidden = !self.state.filterHidden;
                    self.$filterToggle.aria('expanded', !self.state.filterHidden);
                    self.$filter.attr('hidden', self.state.filterHidden);

                    return self;
                },
                bindEvents: function () {
                    var self = this;

                    self.on('click', self.params.filterToggleSelector, function (event) {
                        event.preventDefault();
                        self.throttle('filterToggle', self.filterToggle);
                    });

                    self.on('click', self.params.filterButtonsSelector, function (event) {
                        event.preventDefault();
                        self.filterApply($(this));
                    });

                    return self;
                }
            }
        }, 'feed');

//===========================
// Зум медии
//===========================
        $('.js-figure').depotFigure();

//===========================
// Вкладки стандартные
//===========================
        $('.js-dropdown-tabs').depotDropdown({
            itemsSelector: '.js-dropdown-item',
            kickOff: true,
            onClick: function (event) {
                var self = this;

                var $target = $(event.target).closest(self.params.itemsSelector);
                if ($target.length) {
                    self.$items.removeClass(self.params.activeClassName);
                    $target.addClass(self.params.activeClassName);
                }

                self.collapse();
            },
            onInit: function () {
                var self = this;

                var hash = $.depotHash.toObject();
                if (hash && hash.source) {
                    var $target = self.$items.filter(function (i, item) {
                        var itemHash = $.depotHash.toObject($.depotHash.get(item));
                        return itemHash && itemHash.source === hash.source;
                    });

                    if ($target.length) {
                        $target.addClass(self.params.activeClassName);
                    }
                }

                self.bind('dropdown:reset', self.$container.parent(), function () {
                    self.$items.removeClass(self.params.activeClassName);
                    $.depotHash.removeMatched(/source=(.*)/);
                });

                return self;
            }
        });

//===========================
// Вкладки стандартные
//===========================
        $('.js-tabs-contacts').depotTabs({
            useHash: true,
            beforeChange: function () {
                var self = this;
                self.state.$activeTab.trigger('dropdown:reset');
            }
        });

//===========================
// Вкладки стандартные
//===========================
        $('.js-tabs-default').depotTabs({
            useHash: true
        });

//===========================
// Вкладки продукции
//===========================
        $('.js-tabs-production').depotTabs();

//===========================
// Попап с вариантами
//===========================
        $('.js-popup-variants').depotPopup({
            useHash: true,
            kickOff: false,
            mixins: [
                $.popupVariantsMixin
            ],
            popupVariants: {
                dataParam: 'view',
                onHidePopupVariant: function (variant, variantId) {
                    var self = this;
                    var $variant = $(variant);
                    var $slideshow = $variant.find('.js-history-slideshow');

                    if ($slideshow.length) {
                        $slideshow.trigger('slideshow:reset');
                    }
                }
            },
            beforeInit: function () {
                var self = this;

                self.initPopupVariants();
            }
        });

//===========================
// Попап поиска
//===========================
        $('.js-popup-search').depotPopup({
            useHash: true,
            kickOff: false
        });

//===========================
// Попап меню
//===========================
        $('.js-popup-menu').depotPopup({
            useHash: true,
            kickOff: false
        });

//===========================
// Карточки людей
//===========================
        $.depotSandbox('.js-persons', {
            personsSelector: '.js-persons-person',
            highlightClassName: 'is-highlight',
            extend: {
                getInitialState: function () {
                    var self = this;

                    return {
                        animationDelayID: null
                    };
                },
                onAnimationEnd: function () {
                    var self = this;

                    self.cancelDelay(self.state.animationDelayID);
                    self.$persons.removeClass(self.params.highlightClassName);

                    return self;
                },
                bindEvents: function () {
                    var self = this;

                    self.on('animationend', self.params.personsSelector, function (event) {
                        var $target = $(event.target);
                        if ($target.is(self.params.personsSelector)) {
                            self.onAnimationEnd();
                        }
                    });

                    self.$WINDOW.on('highlight', function (event, data) {
                        var $targetPersons = self.$persons.filter('[data-id*="' + data.anchor + '"]');
                        if ($targetPersons.length) {
                            self.bind('wheel mousewheel DOMMouseScroll pointermove MSPointerMove touchmove', self.$DOCUMENT, function (event) {
                                if (event.type !== 'pointermove' || event.type === 'pointermove' && event.pointerType !== 'mouse') {
                                    self.unbind(self.$DOCUMENT, 'wheel mousewheel DOMMouseScroll pointermove MSPointerMove touchmove');
                                    self.$HTMLBODY.stop();
                                }
                            });

                            self.$HTMLBODY.animate({
                                scrollTop: $targetPersons.first().offset().top
                            }, {
                                always: function () {
                                    self.unbind('wheel mousewheel DOMMouseScroll pointermove MSPointerMove touchmove', self.$DOCUMENT);
                                    $targetPersons.addClass(self.params.highlightClassName);
                                    self.state.animationDelayID = self.delay(self.onAnimationEnd, 2000);
                                }
                            });
                        }
                    });

                    return self;
                }
            }
        }, 'persons');

//===========================
// SVG карта
//===========================
        $.depotSandbox('.js-map-svg', {
            canvasSelector: '.js-map-canvas',
            layerSelector: '.js-map-layer',
            listSelector: '.js-map-list',
            pointsSelector: '.js-map-point',
            groupsSelector: 'g[id^="fo-"]',
            extend: {
                getInitialState: function () {
                    var self = this;

                    return {
                        hoverDelayID: null
                    };
                },
                getSVGRoot: function () {
                    var self = this;

                    return $(self.$layer.get(0).contentDocument.getElementsByTagName('svg')[0]);
                },
                insertFilter: function (svg, filterParams) {
                    var self = this;
                    var namespace = 'http://www.w3.org/2000/svg';
                    var defs;
                    var filter = document.createElementNS(namespace, 'filter');
                    var feDropShadow = document.createElementNS(namespace, 'feDropShadow');

                    filter.setAttribute('id', filterParams.id);

                    feDropShadow.setAttribute('dx', filterParams.dx);
                    feDropShadow.setAttribute('dy', filterParams.dy);
                    feDropShadow.setAttribute('stdDeviation', filterParams.blur);
                    feDropShadow.setAttribute('flood-color', filterParams.color);

                    if (svg.getElementsByTagName('defs').length) {
                        defs = svg.getElementsByTagName('defs')[0];
                    } else {
                        defs = document.createElementNS(namespace, 'defs');
                        svg.appendChild(defs);
                    }

                    filter.appendChild(feDropShadow);
                    defs.appendChild(filter);

                    return self;
                },
                clickGroup: function (group) {
                    var self = this;

                    self.$WINDOW.trigger('highlight', {
                        anchor: group.id
                    });

                    return self;
                },
                hoverGroup: function (group) {
                    var self = this;

                    self.cancelDelay(self.state.hoverDelayID);
                    self.state.hoverDelayID = self.delay(function () {
                        self.$groups.removeAttr('style');
                        if (!group.hasAttribute('style')) {
                            if (group.id) {
                                self.$groups.parent().append(group);
                                self.$points.removeClass(self.params.activeClassName);
                                group.setAttribute('style', 'filter:url(#dropshadow)');
                                self.$points.filter('[data-id="' + group.id + '"]').addClass(self.params.activeClassName);
                            }
                        }
                    }, 50);

                    return self;
                },
                initSVG: function () {
                    var self = this;

                    self.$svg = self.getSVGRoot();
                    self.$groups = self.$svg.find(self.params.groupsSelector);

                    self.insertFilter(self.$svg.get(0), {
                        id: 'dropshadow',
                        dx: '0',
                        dy: '3',
                        blur: '10',
                        color: 'rgba(0, 121, 52, .5)',
                    });

                    self.$groups.on('mouseenter', function (event) {
                        self.hoverGroup(this);
                    });

                    self.$groups.on('click', function (event) {
                        event.preventDefault();
                        self.clickGroup(this);
                    });

                    return self;
                },
                bindEvents: function () {
                    var self = this;

                    self.$layer.get(0).onload = self.initSVG.bind(self);

                    self.on('click', self.params.listSelector, function (event) {
                        var width = self.$layer.width();
                        var height = self.$layer.height();
                        var top = self.$layer.offset().top;
                        var left = self.$layer.offset().left;
                        var result = self.format('top: ${top|fixed(6)}%;left: ${left|fixed(6)}%;', {
                            top: (event.originalEvent.pageY - top) / height * 100,
                            left: (event.originalEvent.pageX - left) / width * 100
                        });
                    });
                }
            }
        }, 'svgMap');

//===========================
// Карусель продуктов
//===========================
        var CACHED_DOCUMENTS = {};
        $.depotSandbox('.js-carousel-product', {
            listSelector: '.js-carousel-list',
            itemsSelector: '.js-carousel-item',
            variable: 'carouselItems',
            extend: {
                fetchItems: function (callback) {
                    var self = this;

                    var itemURLs = window[self.params.variable];

                    if (Array.isArray(itemURLs) && itemURLs.length) {
                        var currentURL = self.$items.first().data('url');
                        var currentURLIndex = itemURLs.indexOf(currentURL);
                        itemURLs.splice(currentURLIndex, 1);
                        var requestsQuantity = itemURLs.length;
                        var responsesQuantity = 0;
                        if (requestsQuantity) {
                            $.each(itemURLs, function (i, url) {
                                $.ajax({
                                    url: url,
                                    type: 'GET',
                                    dataType: 'html',
                                    complete: function (jqXHR, textStatus) {
                                        responsesQuantity += 1;

                                        if (jqXHR.status === 200 && textStatus === 'success') {
                                            var parser = new DOMParser();
                                            var $document = $(parser.parseFromString(jqXHR.responseText, 'text/html'));
                                            CACHED_DOCUMENTS[url] = $document;
                                            var $galleryItem = $document.find(self.params.itemsSelector);
                                            self.$list.append($galleryItem);
                                            $galleryItem.trigger('lazy:added').trigger('figure:added');
                                        }

                                        if (requestsQuantity === responsesQuantity) {
                                            self.call(callback);
                                        }
                                    }
                                });
                            });
                        } else {
                            self.call(callback);
                        }
                    } else {
                        self.call(callback);
                    }


                    return self;
                },
                init: function () {
                    var self = this;

                    self.fetchItems(function () {
                        $('.js-carousel-product').depotGallery({
                            viewportSelector: '.js-carousel-viewport',
                            listSelector: '.js-carousel-list',
                            itemsSelector: '.js-carousel-item',
                            tooltipPointsSelector: '.js-carousel-point',
                            tooltipsSelector: '.js-carousel-tooltip',
                            tooltipCloseSelector: '.js-carousel-tooltip-close',
                            ratio: 566 / 1006,
                            mixins: [
                                $.galleryNavigationMixin,
                                $.galleryFavoritesMixin,
                                $.galleryContentMixin
                            ],
                            galleryNavigation: {
                                template: '<div class="carousel__navigation">${buttonBackwardsTemplate}${buttonForwardsTemplate}</div>${bulletsTemplate}',
                                buttonBackwardsTemplate: '<button class="carousel__button carousel__button_backwards ${backwardsSelector|substr(1)}" type="button" aria-label="_{buttons.backwards}" title="_{buttons.backwards}"#{if backwardsDisabled} disabled#{endif}></button>',
                                buttonForwardsTemplate: '<button class="carousel__button carousel__button_forwards ${forwardsSelector|substr(1)}" type="button" aria-label="_{buttons.forwards}" title="_{buttons.forwards}"#{if forwardsDisabled} disabled#{endif}></button>',
                                bulletsTemplate: '#{if showNavigation}<div class="carousel__bullets">#{for bullet in 1..${bullets}}${bulletTemplate}#{endfor}</div>#{endif}',
                                bulletTemplate: '<button class="carousel__bullet ${bulletsSelector|substr(1)}" type="button" data-index="${bullet}"></button>',
                                backwardsSelector: '.js-carousel-backwards',
                                forwardsSelector: '.js-carousel-forwards',
                                bulletsSelector: '.js-carousel-bullet',
                            },
                            galleryContent: {
                                cachedDocuments: CACHED_DOCUMENTS,
                                onInsert: function () {
                                    var self = this;

                                    self.delay(function () {
                                        initAJAXContent($.depotProto.$BODY);
                                    }, 300);

                                    return self;
                                }
                            },
                            beforeInit: function () {
                                var self = this;

                                self.initGalleryNavigation();
                                self.initGalleryFavorites();
                                self.initGalleryContent();

                                return self;
                            },
                            onInit: function () {
                                var self = this;

                                self.on('click', self.params.tooltipPointsSelector, function (event) {
                                    event.preventDefault();
                                    var $point = $(this);
                                    var $tooltip = self.$tooltips.filter('[data-id="' + $point.data('id') + '"]');

                                    if ($tooltip.hasClass(self.params.activeClassName)) {
                                        $tooltip.removeClass(self.params.activeClassName);
                                        self.off(['click', 'tooltip']);
                                    } else {
                                        self.$tooltips.removeClass(self.params.activeClassName);
                                        $tooltip.addClass(self.params.activeClassName);

                                        self.on(['click', 'tooltip'], function (event) {
                                            if (!$(event.target).closest(self.params.tooltipsSelector).length) {
                                                self.$tooltips.removeClass(self.params.activeClassName);
                                                self.off(['click', 'tooltip']);
                                            }
                                        });
                                    }
                                });

                                self.on('click', self.params.tooltipCloseSelector, function (event) {
                                    event.preventDefault();
                                    var $close = $(this);
                                    var $tooltip = $close.closest(self.params.tooltipsSelector);
                                    $tooltip.removeClass(self.params.activeClassName);
                                    self.off(['click', 'tooltip']);
                                });

                                return self;
                            },
                            onChange: function (DOMIndex, force) {
                                var self = this;

                                self.$tooltips.removeClass(self.params.activeClassName);

                                return self;
                            }
                        });
                    });

                    self.call(self.params.onInit);

                    return self;
                }
            }
        }, 'carouselProduct');

//===========================
// AJAX контент
//===========================
        function initAJAXContent($container) {
            // Переключатель модификаций
            $.depotSandbox('.js-switcher-default', {
                buttonsSelector: '.js-switcher-button',
                targetElements: [
                    '~ *'
                ],
                headElements: [
                    'title',
                    'meta[name="description"]',
                    'meta[name="keywords"]'
                ],
                onInsert: function () {
                    var self = this;
                    initAJAXContent(self.$container.parent());
                },
                extend: {
                    getInitialState: function () {
                        var self = this;
                        return {
                            buttonIndex: 0,
                            pushStateEnabled: true,
                            request: null
                        };
                    },
                    createHistoryState: function (newHistoryState) {
                        var currentHistoryState = window.history && window.history.state || {};
                        return $.extend(true, {}, currentHistoryState, {
                            switcher: newHistoryState
                        });
                    },
                    switchTo: function (buttonIndex) {
                        var self = this;
                        var $button = self.$buttons.eq(buttonIndex);

                        if ($button.length && !$button.hasClass(self.params.activeClassName)) {
                            self.state.buttonIndex = buttonIndex;

                            self.$buttons.removeClass(self.params.activeClassName);
                            $button.addClass(self.params.activeClassName);
                            self.contentRequest($button.attr('href'));
                        } else if (!self.state.pushStateEnabled) {
                            self.state.pushStateEnabled = true;
                        }

                        return self;
                    },
                    contentRequest: function (url) {
                        var self = this;

                        if (self.state.request) {
                            self.state.request.abort();
                        }

                        var $cachedDocument = self.cache.documents[url];

                        if ($cachedDocument) {
                            self.contentInsert(url, $cachedDocument);
                        } else {
                            self.state.request = $.ajax({
                                url: url,
                                type: 'GET',
                                dataType: 'html',
                                complete: function (jqXHR, textStatus) {
                                    if (jqXHR.status === 200 && textStatus === 'success') {
                                        var parser = new DOMParser();
                                        var $document = $(parser.parseFromString(jqXHR.responseText, 'text/html'));
                                        self.cache.documents[url] = $document;
                                        self.contentInsert(url, $document);
                                    }
                                }
                            });
                        }

                        return self;
                    },
                    contentInsert: function (url, $document) {
                        var self = this;

                        if (self.params.headElements && self.params.headElements.length) {
                            self.params.headElements.forEach(function (selector) {
                                var $currentHead = self.$DOCUMENT.find('head');
                                var $newHead = $document.find('head');

                                var $currentHeadElement = $currentHead.find(selector);
                                var $newHeadElement = $newHead.find(selector);

                                if ($currentHeadElement && $currentHeadElement.length) {
                                    $currentHeadElement.replaceWith($newHeadElement.clone());
                                } else {
                                    $currentHead.append($newHeadElement.clone());
                                }
                            });
                        }

                        var $targets = $document.find(self.getSelector() + self.params.targetElements).clone();
                        self.$container.nextAll().trigger('destroy').remove();
                        self.$container.after($targets);
                        $targets.trigger('lazy:added').trigger('figure:added');

                        if (self.state.pushStateEnabled) {
                            if (window.history && typeof window.history.pushState === 'function') {
                                var title = $document.get(0).title || '';
                                var historyState = self.createHistoryState({
                                    buttonIndex: self.state.buttonIndex
                                });
                                window.history.pushState(historyState, title, url);
                            }
                        } else {
                            self.state.pushStateEnabled = true;
                        }

                        self.call(self.params.onInsert);

                        return self;
                    },
                    bindEvents: function () {
                        var self = this;

                        self.on('click', self.params.buttonsSelector, function (event) {
                            event.preventDefault();
                            var $button = $(this);
                            var buttonIndex = $button.parent().index();
                            self.throttle('switch', function () {
                                self.switchTo(buttonIndex);
                                var $prev = self.$container.prev();
                                self.$HTMLBODY.animate({
                                    scrollTop: $prev.offset().top + $prev.outerHeight(true)
                                }, 450);
                            });
                        });

                        self.bind('popstate', self.$WINDOW, function (event) {
                            var historyState = event.originalEvent.state;
                            if (historyState && historyState.switcher) {
                                self.state.pushStateEnabled = false;
                                self.throttle('switch', function () {
                                    self.switchTo(historyState.switcher.buttonIndex);
                                });
                            }
                        });
                    },
                    init: function () {
                        var self = this;

                        self.cache = {
                            documents: {}
                        };

                        var historyState;
                        if (window.history && window.history.state) {
                            historyState = window.history.state;
                            if (historyState && historyState.switcher) {
                                self.state.pushStateEnabled = false;

                                self.throttle('switch', function () {
                                    self.switchTo(historyState.switcher.buttonIndex);
                                });
                            } else if (typeof window.history.replaceState === 'function') {
                                var title = self.$DOCUMENT.get(0).title || '';
                                historyState = self.createHistoryState({
                                    buttonIndex: self.state.buttonIndex
                                });

                                window.history.replaceState(historyState, title);
                            }
                        }
                    }
                }
            }, 'switcher');

            // Промо блок с фоновым видео
            $.depotSandbox('.js-promo-youtube', {
                sourceSelector: '.js-promo-background',
                playSelector: '.js-promo-play',
                bodyCroppedClassName: 'is-cropped',
                extend: {
                    getInitialState: function () {
                        var self = this;

                        return {
                            isActive: false,
                            playerReady: false,
                            playerId: 'youtube_' + self.hash,
                            videoId: self.$container.data('youtube')
                        };
                    },
                    inViewport: function () {
                        var self = this;

                        var documentVisible = document.visibilityState !== 'hidden';
                        if (!documentVisible) {
                            return false;
                        }

                        if (self.$BODY.hasClass(self.params.bodyCroppedClassName)) {
                            return false;
                        }

                        var $sticky = $('js-sticky');
                        var stickyHeight = 0;
                        $sticky.each(function (i, stickyElement) {
                            stickyHeight += $(stickyElement).outerHeight();
                        });

                        var containerTop = self.$container.offset().top;
                        var containerBottom = containerTop + self.$container.outerHeight(true);
                        var windowTop = self.$WINDOW.scrollTop() + stickyHeight;
                        var windowBottom = windowTop + self.$WINDOW.innerHeight();

                        var isAboveViewport = containerBottom < windowTop;
                        var isUnderViewport = containerTop > windowBottom;

                        return !(isAboveViewport || isUnderViewport);
                    },
                    onReady: function (event) {
                        var self = this;
                        self.player = event.target;

                        if (!self.state.isActive) {
                            self.player.mute();
                        }
                        self.player.playVideo();

                        return self;
                    },
                    onStateChange: function (event) {
                        var self = this;
                        var state = event && event.data;

                        if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.PLAYING) {
                            self.$container.removeClass(self.params.processingClassName);
                        } else if (state === YT.PlayerState.ENDED) {
                            self.player.playVideo();
                        }

                        return self;
                    },
                    addPlayer: function () {
                        var self = this;

                        var inViewport = self.inViewport();
                        if (!inViewport) {
                            return self;
                        }

                        self.state.playerReady = true;
                        self.unbind('scroll resize', self.$WINDOW);
                        self.unbind('visibilitychange', self.$DOCUMENT);

                        var playerHTML = self.format('<div class="promo__player" id="${playerId}"></div>', self.state);
                        self.$source.append(playerHTML);

                        window.onYouTubeIframeAPIReady = window.onYouTubeIframeAPIReady || function () {
                            window.youTubeIframeAPIReady = true;
                        };

                        self.$container.addClass(self.params.processingClassName);

                        self.addScripts({
                            src: 'https://www.youtube.com/iframe_api',
                            exports: ['YT', 'youTubeIframeAPIReady']
                        }, function (error) {
                            if (!error) {
                                self.player = new YT.Player(self.state.playerId, {
                                    videoId: self.state.videoId,
                                    width: self.$container.width(),
                                    height: self.$container.height(),
                                    playerVars: {
                                        hl: self.LANGUAGE,
                                        origin: window.location.origin,
                                        autoplay: 1,
                                        autohide: 1,
                                        disablekb: 1,
                                        playsinline: 1,
                                        controls: 0,
                                        enablejsapi: 1,
                                        showinfo: 0,
                                        loop: 1,
                                        rel: 0,
                                        fs: 0,
                                        start: 0,
                                        end: 20
                                    },
                                    events: {
                                        onReady: function (event) {
                                            self.onReady(event);
                                        },
                                        onStateChange: function (event) {
                                            self.onStateChange(event);
                                        }
                                    }
                                });
                            }
                        });

                        return self;
                    },
                    play: function () {
                        var self = this;

                        if (window.youTubeIframeAPIReady) {
                            self.$container.addClass(self.params.processingClassName);
                            self.$container.addClass(self.params.activeClassName);
                            self.state.isActive = true;
                            $(self.player.h).remove();
                            var playerHTML = self.format('<div class="promo__player" id="${playerId}"></div>', self.state);
                            self.$source.append(playerHTML);
                            self.player = new YT.Player(self.state.playerId, {
                                videoId: self.state.videoId,
                                width: self.$container.width(),
                                height: self.$container.height(),
                                playerVars: {
                                    hl: self.LANGUAGE,
                                    origin: window.location.origin,
                                    autoplay: 1,
                                    enablejsapi: 1,
                                },
                                events: {
                                    onReady: function (event) {
                                        self.onReady(event);
                                    },
                                    onStateChange: function (event) {
                                        self.onStateChange(event);
                                    }
                                }
                            });
                        }

                        return self;
                    },
                    bindEvents: function () {
                        var self = this;

                        self.bind('scroll resize', self.$WINDOW, function () {
                            self.throttle('scroll', self.addPlayer);
                        });

                        self.bind('visibilitychange', self.$DOCUMENT, function () {
                            self.throttle('visibilitychange', self.addPlayer);
                        });

                        self.on('click', self.params.playSelector, function (event) {
                            event.preventDefault();
                            self.play();
                        });

                        return self;
                    },
                    init: function () {
                        var self = this;

                        self.addPlayer();
                    }
                }
            }, 'promoYouTube');
            // Якоря
            $('.js-anchors-default').depotAnchors({
                stickySelector: '.js-sticky',
                sectionsSelector: '[data-anchors]'
            });
            // Вкладки стандартные
            $('.js-tabs-silent').depotTabs();
            // Галерея
            $('.js-gallery-default').depotGallery({
                ratio: 680 / 1214,
                mixins: [
                    $.galleryThumbsMixin
                ],
                galleryThumbs: {},
                beforeInit: function () {
                    var self = this;

                    self.initGalleryThumbs();
                }
            });
            // Раскрывашка подробнее
            $('.js-dropdown-details').depotDropdown();
        }

        initAJAXContent();

//===========================
// Селект
//===========================
        $('.js-form-field-select').formFieldSelect();

//===========================
// Файлы
//===========================
        $('.js-form-field-file').formFieldFile();

//===========================
// Диапазон
//===========================
        $('.js-form-field-range').formFieldRange({
            getInitialValue: function (min, max, step) {
                var date = new Date();
                var minHour = date.getHours();

                if (minHour < min || minHour >= max) {
                    minHour = min;
                }

                var steps = (max - min) / step;
                var maxHour = minHour + step;

                return {
                    min: minHour,
                    minLeft: (minHour - min) / steps * 100,
                    max: maxHour,
                    maxLeft: (maxHour - min) / steps * 100
                };
            }
        });

//===========================
// Карточки продукции
//===========================
        $.depotSandbox('.js-feed-production', {
            toggleSelector: '.js-feed-toggle',
            filterSelector: '.js-feed-filter',
            listSelector: '.js-feed-list',
            itemsSelector: '.js-feed-item',
            emptySelector: '.js-feed-empty',
            favoriteSelector: '.js-feed-toggle-item',
            favoriteTemplate: '<button class="feed__favorite-item ${favoriteSelector|substr(1)}#{if isFavorite} is-active#{endif}" type="button" title="#{if isFavorite}_{buttons.remove}#{else}_{buttons.add}#{endif}" aria-label="#{if isFavorite}_{buttons.remove}#{else}_{buttons.add}#{endif}"></button>',
            dictionary: {
                buttons: {
                    add: {
                        ru: 'Добавить в избранное',
                        en: 'Add to favourites'
                    },
                    remove: {
                        ru: 'Удалить из избранного',
                        en: 'Remove from favorites'
                    }
                }
            },
            extend: {
                getInitialState: function () {
                    var self = this;

                    return {
                        expanded: true,
                        favorites: $.favorites.getAll()
                    };
                },
                updateFavorites: function () {
                    var self = this;

                    self.$items.each(function (i, item) {
                        var $item = $(this);
                        var $link = $item.find('a');
                        var $button = $item.find(self.params.favoriteSelector);
                        var href = $link.get(0).href;
                        var key = $.favorites.generateKey(href);
                        var isFavorite = !!self.state.favorites[key];
                        var buttonContext = $.extend(true, self.cleanObject(self.params), {
                            isFavorite: isFavorite
                        });

                        var buttonHTML = self.format(self.params.favoriteTemplate, buttonContext);

                        if ($button && $button.length) {
                            $button.replaceWith(buttonHTML);
                        } else {
                            $item.prepend(buttonHTML);
                        }

                    });

                    return self;
                },
                toggleFilter: function () {
                    var self = this;

                    self.state.expanded = !self.state.expanded;

                    self.$toggle.aria('expanded', self.state.expanded);
                    self.$filter.toggleClass('is-expanded', self.state.expanded);

                    return self;
                },
                filterAny: function (params) {
                    var self = this;
                    var paramsQuantity = params ? Object.keys(params).length : 0;
                    var hiddenQuantity = 0;

                    self.$items.each(function (i, item) {
                        var $item = $(item);
                        var itemData = $item.data();
                        var matchesQuantity = 0;

                        if (itemData) {
                            $.each(params, function (paramName, paramValue) {
                                if (itemData[paramName]) {
                                    var itemParamValues = itemData[paramName].toString().split(/[, ]+/);

                                    if (itemParamValues.indexOf(paramValue.toString()) !== -1) {
                                        matchesQuantity += 1;
                                    }
                                }
                            });
                        }

                        var isHidden = paramsQuantity !== matchesQuantity;
                        if (isHidden) {
                            hiddenQuantity += 1;
                        }
                        $item.toggleClass('is-hidden', isHidden);
                    });

                    self.$empty.prop('hidden', self.$items.length !== hiddenQuantity);

                    return self;
                },
                bindEvents: function () {
                    var self = this;

                    $.favorites.onChange(function (favorites) {
                        self.state.favorites = favorites;
                        self.updateFavorites();
                    });

                    self.on('click', self.params.favoriteSelector, function (event) {
                        event.preventDefault();
                        var $button = $(this);
                        var $item = $button.closest(self.params.itemsSelector);
                        var $link = $item.find('a');
                        var url = $link.get(0).href;
                        var key = $.favorites.generateKey(url);

                        $.favorites.toggleItem(key, {
                            image: $item.find('.card__image').attr('src'),
                            label: $item.find('.card__label').text(),
                            text: $item.find('.card__text').text(),
                            url: url
                        });
                    });

                    self.on('click', self.params.toggleSelector, function (event) {
                        event.preventDefault();
                        self.throttle('toggle', self.toggleFilter);
                    });

                    return self;
                },
                init: function () {
                    var self = this;

                    self.updateFavorites();

                    self.toggleFilter();

                    self.$filter.depotForm({
                        validation: false,
                        onChangeSubmit: true,
                        onSubmit: function () {
                            var filter = this;
                            var filterData = $.depotParse(filter.state.formData, {empty: false});
                            self.filterAny(filterData);
                        }
                    });
                }
            }
        });

//===========================
// Карточки продукции
//===========================
        $.depotSandbox('.js-feed-favorite', {
            listSelector: '.js-feed-list',
            itemsSelector: '.js-feed-item',
            removeItemSelector: '.js-feed-remove-item',
            itemTemplate: '#{for item in items}<div class="feed__item feed__item_third js-feed-item"><button class="feed__remove-item js-feed-remove-item" type="button" title="_{buttons.remove}" aria-label="_{buttons.remove}"></button><article class="card card_production card_favorite" data-clickable><div class="card__picture"><img class="card__image" loading="lazy" src="${item.image}" width="391" height="220" intrinsicsize="391x220" alt=""></div><div class="card__body"><div class="card__label" role="heading" aria-level="4"><a class="card__link" href="${item.url}">${item.label|ft}</a></div><div class="card__text">${item.text|ft}</div></div></article></div>#{empty}<div class="feed__empty">_{empty}</div>#{endfor}',
            dictionary: {
                empty: {
                    ru: 'Вы ещё не добавляли избранные.',
                    en: 'You have not added any favorites yet.'
                },
                buttons: {
                    remove: {
                        ru: 'Удалить из избранного',
                        en: 'Remove from favorites',
                    }
                }
            },
            extend: {
                getInitialState: function () {
                    var self = this;

                    return {
                        items: $.favorites.getAll()
                    };
                },
                render: function (items) {
                    var self = this;

                    var itemsHTML = self.format(self.params.itemTemplate, {
                        items: items
                    });

                    self.$list.html(itemsHTML);

                    return self;
                },
                bindEvents: function () {
                    var self = this;

                    $.favorites.onChange(function (items) {
                        self.render(items);
                    });

                    self.on('click', self.params.removeItemSelector, function (event) {
                        event.preventDefault();
                        var $button = $(this);
                        var $item = $button.closest(self.params.itemsSelector);
                        var $link = $item.find('a');
                        var href = $link.get(0).href;
                        var key = $.favorites.generateKey(href);

                        $.favorites.removeItem(key);
                    });

                    return self;
                },
                init: function () {
                    var self = this;

                    self.render(self.state.items);
                }
            }
        });

//===========================
// Кнопка избранного
//===========================
        $.depotSandbox('.js-favorites', {
            extend: {
                update: function (favorites) {
                    var self = this;

                    self.$container.attr('data-quantity', Object.keys(favorites).length);
                },
                bindEvents: function () {
                    var self = this;

                    $.favorites.onChange(function (favorites) {
                        self.update(favorites);
                    });

                    return self;
                },
                init: function () {
                    var self = this;

                    self.update($.favorites.getAll());
                }
            }
        }, 'favorites');

//===========================
// Форма с файлами
//===========================
        $('.js-form-multipart').depotForm({
            ajax: true,
            dataType: 'html',
            validators: {
                'is-file-quantity': {
                    test: function (element, value, trimmedValue) {
                        var classMatches = element.getAttribute('class').match(/is-file-quantity:([^ ]+)/);
                        var maxQuantity = classMatches && parseFloat(classMatches[1]) || 0;
                        var files = element.files;
                        var filesQuantity = files.length;

                        return filesQuantity <= maxQuantity;
                    },
                    messagePath: 'errors.file.quantity'
                },
                'is-file-size': {
                    test: function (element, value, trimmedValue) {
                        var classMatches = element.getAttribute('class').match(/is-file-size:([^ ]+)/);
                        var maxSize = classMatches && parseFloat(classMatches[1]) || 0;
                        var files = element.files;
                        var filesQuantity = files.length;
                        var fileIndex = 0;
                        var isValid = true;
                        for (fileIndex; fileIndex < filesQuantity; fileIndex += 1) {
                            if (files.item(fileIndex).size > maxSize) {
                                isValid = false;
                            }
                        }

                        return isValid;
                    },
                    messagePath: 'errors.file.size'
                }
            },
            dictionary: {
                errors: {
                    file: {
                        size: {
                            ru: 'Проверьте размер ${files.length|plural(файла, файлов)}',
                            en: 'Check the size of ${files.length|plural(file, files)}'
                        },
                        quantity: {
                            ru: 'Проверьте количество файлов',
                            en: 'Check the count of files'
                        }
                    }
                }
            },
            mixins: [
                $.formGRecaptchaMixin,
                $.formResponseMixin,
                $.formMessageMixin
            ],
            formGRecaptcha: {
                render: true
            },
            beforeInit: function () {
                var self = this;

                self.initFormGRecaptcha();
                self.initFormResponse();
                self.initFormMessage();
            }
        });

//===========================
// Форма с файлами
//===========================
        $('.js-form-search').depotForm({
            ajax: false
        });

//===========================
// Скрытая раскрывашка
//===========================
        $('.js-dropdown-hidden').depotDropdown({
            beforeInit: function () {
                var self = this;

                self.params.toggleSelector = self.format('#${toggleId}', {
                    toggleId: self.$panel.attr('id').replace('panel', 'button')
                });

                self.getElements(self.params, true);

                return self;
            }
        });

//===========================
// История
//===========================
        $.depotSandbox('.js-history', {
            itemsSelector: '.js-history-item',
            slideshowSelector: '.js-history-slideshow',
            yearSelector: '.js-history-year',
            closeSelector: '.js-history-close',
            extend: {
                bindEvents: function () {
                    var self = this;


                    self.on('click', self.params.itemsSelector, function (event) {
                        var $item = $(this);
                        var $target = $(event.target);

                        if (!$target.closest(self.params.slideshowSelector).length) {
                            event.preventDefault();
                            var $slideshow = $item.find(self.params.slideshowSelector);

                            $item.addClass(self.params.visibleClassName);
                            $slideshow.slideDown();
                        }
                    });

                    self.on('click', self.params.yearSelector, function (event) {
                        var $button = $(this);
                        var $item = $button.closest(self.params.itemsSelector);
                        if ($item.hasClass(self.params.visibleClassName)) {
                            event.preventDefault();
                            event.stopPropagation();
                            self.triggerTo(self.params.closeSelector, 'click');
                        }
                    });

                    self.on('click', self.params.closeSelector, function (event) {
                        event.preventDefault();
                        var $button = $(this);
                        var $item = $button.closest(self.params.itemsSelector);
                        var $slideshow = $item.find(self.params.slideshowSelector);

                        $item.removeClass(self.params.visibleClassName);
                        $slideshow.delay(250).slideUp(function () {
                            $slideshow.trigger('slideshow:reset');
                        });
                    });

                    return self;
                }
            }
        }, 'history');

//===========================
// Кастомный скролл
//===========================
        $('.js-overflow-content').depotOverflow();

//===========================
// Слайдшоу
//===========================
        $.depotSandbox('.js-history-slideshow', {
            listSelector: '.js-slideshow-list',
            itemsSelector: '.js-slideshow-item',
            backwardsSelector: '.js-slideshow-backwards',
            forwardsSelector: '.js-slideshow-forwards',
            counterSelector: '.js-slideshow-counter',
            navigationTemplate: '<div class="slideshow__navigation">${buttonBackwardsTemplate}${buttonForwardsTemplate}${counterTemplate}</div>',
            buttonBackwardsTemplate: '<button class="slideshow__button slideshow__button_backwards ${backwardsSelector|substr(1)}" type="button" aria-label="_{buttons.backwards}" title="_{buttons.backwards}"#{if backwardsDisabled} disabled#{endif}></button>',
            buttonForwardsTemplate: '<button class="slideshow__button slideshow__button_forwards ${forwardsSelector|substr(1)}" type="button" aria-label="_{buttons.forwards}" title="_{buttons.forwards}"#{if forwardsDisabled} disabled#{endif}></button>',
            counterTemplate: '<div class="slideshow__counter ${counterSelector|substr(1)}">${counterTextTemplate}</div>',
            counterTextTemplate: '${is}/${of}',
            dictionary: {
                buttons: {
                    backwards: {
                        ru: 'Назад',
                        en: 'Backwards'
                    },
                    forwards: {
                        ru: 'Вперед',
                        en: 'Forwards'
                    }
                }
            },
            extend: {
                getInitialState: function () {
                    var self = this;

                    return {
                        quantity: self.$items.length,
                        currentIndex: 0
                    };
                },
                renderNavigation: function () {
                    var self = this;

                    var navigationContext = $.extend(true, self.cleanObject(self.params), {
                        backwardsDisabled: self.state.currentIndex === 0,
                        forwardsDisabled: self.state.currentIndex + 1 === self.state.quantity,
                        is: self.state.currentIndex + 1,
                        of: self.state.quantity
                    });

                    var navigationHTML = self.format(self.params.navigationTemplate, navigationContext);

                    self.$container.append(navigationHTML);
                    self.getElements();

                    return self;
                },
                update: function () {
                    var self = this;

                    self.$backwards.prop('disabled', self.state.currentIndex === 0);
                    self.$forwards.prop('disabled', self.state.currentIndex === self.state.quantity - 1);

                    self.$counter.html(self.format(self.params.counterTextTemplate, {
                        is: self.state.currentIndex + 1,
                        of: self.state.quantity
                    }));

                    return self;
                },
                goTo: function (index) {
                    var self = this;
                    var safeIndex = self.clamp(0, index, self.state.quantity - 1);

                    self.$items.removeClass(self.params.activeClassName);
                    self.$items.eq(safeIndex).addClass(self.params.activeClassName)
                        .find('[loading="lazy"]').trigger('lazy:load');

                    self.state.currentIndex = safeIndex;

                    self.update();

                    return self;
                },
                goForwards: function () {
                    var self = this;
                    var targetIndex = self.state.currentIndex += 1;

                    self.goTo(targetIndex);

                    return self;
                },
                goBackwards: function () {
                    var self = this;
                    var targetIndex = self.state.currentIndex -= 1;

                    self.goTo(targetIndex);

                    return self;
                },
                bindEvents: function () {
                    var self = this;

                    self.on('slideshow:reset', function () {
                        self.goTo(0);
                    });

                    self.on('click', self.params.forwardsSelector, function (event) {
                        event.preventDefault();
                        self.throttle('goForwards', self.goForwards);
                    });

                    self.on('click', self.params.backwardsSelector, function (event) {
                        event.preventDefault();
                        self.throttle('goBackwards', self.goBackwards);
                    });

                    return self;
                },
                init: function () {
                    var self = this;

                    self.renderNavigation();

                    return self;
                }
            },
        }, 'slideshow');

    }); // dom ready
}(jQuery));

//# sourceMappingURL=global.js.map