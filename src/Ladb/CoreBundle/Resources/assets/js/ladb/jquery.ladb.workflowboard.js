+function ($) {
    'use strict';

    var GRID_SPACING = 10;
    var TASK_WIDGET_PREFIX =  'ladb_workflow_task_widget_';

    // CLASS DEFINITION
    // ======================

    var LadbWorkflowBoard = function(element, options) {
        this.options = options;
        this.$element = $(element);

        this.session = null;
        this.plumb = null;

        this.$loadingPanel = $('.ladb-loading-panel', this.$element);
        this.$loadingStatus = $('.ladb-loading-status', this.$loadingPanel);

        this.$diagram = $('#ladb_workflow_task_diagram', this.$element);
        this.$panzoom = $(".ladb-panzoom", this.$diagram);
        this.$canvas = $('.ladb-jtk-canvas', this.$panzoom);

        this.$btnAddTask = $('#ladb_btn_add_task', this.$element);
    };

    LadbWorkflowBoard.DEFAULTS = {
        wsUri: 'ws://127.0.0.1:8080',
        wsChannel: '',
        minScale: 0.4,
        maxScale: 1,
        incScale: 0.1,
        listTaskPath: null,
        newTaskPath: null,
        createTaskPath: null,
        editTaskPath: null,
        updateTaskPath: null,
        positionUpdateTaskPath: null,
        statusUpdateTaskPath: null,
        createTaskConnectionPath: null,
        deleteTaskConnectionPath: null
    };

    LadbWorkflowBoard.prototype.getCurrentScale = function() {
        if (this.$panzoom) {
            return this.$panzoom.panzoom("getMatrix")[0];
        }
        return 1;
    };

    LadbWorkflowBoard.prototype.markLoading = function(status) {
        this.$loadingPanel.show();
        this.$loadingStatus.html(status ? status : '');
    };

    LadbWorkflowBoard.prototype.unmarkLoading = function() {
        this.$loadingPanel.hide();
    };

    LadbWorkflowBoard.prototype.appendToAnimate = function(element, newParent) {

        var $taskRow = $(element);
        var $taskBox = $('.ladb-box', $taskRow);
        var $newParent= $(newParent);

        var oldOffset = $taskRow.offset();
        $taskRow.appendTo($newParent);
        var newOffset = $taskRow.offset();

        var $tmpTaskRow = $taskRow.clone().appendTo('body');
        $tmpTaskRow.css({
            'position': 'absolute',
            'left': oldOffset.left,
            'top': oldOffset.top,
            'width': $taskRow.width(),
            'z-index': 1000
        });
        $taskRow.css({
            'height': $taskRow.height()
        });
        $taskBox.hide();
        $tmpTaskRow.animate({'top': newOffset.top, 'left': newOffset.left}, 500, function(){
            $taskRow.css({
                'height': 'auto'
            });
            $taskBox.show();
            $tmpTaskRow.remove();
        });

    };

    LadbWorkflowBoard.prototype.updateBoardFromJsonData = function(data) {
        var that = this;

        var response = JSON.parse(data);

        var i, taskInfos, $taskWidget, $taskRow;

        // Workflow
        if (response.workflowInfos) {
            $('#ladb_workflow_status_panel', this.$element).replaceWith(response.workflowInfos.statusPanel);
        }

        // Tasks
        if (response.taskInfos) {

            if (that.plumb) {
                that.plumb.deleteEveryEndpoint();
                that.$canvas.empty();
            }
            for (i = 0; i <= 4; i++) {
                $('#collapse_status_' + i + ' .panel-body').empty();
            }

            for (i = 0; i < response.taskInfos.length; i++) {

                taskInfos = response.taskInfos[i];

                if (that.plumb) {
                    $taskWidget = $(taskInfos.widget);
                    that.$canvas.append($taskWidget);
                    that.initTaskWidget($taskWidget);
                }

                $taskRow = $(taskInfos.row);
                $('#collapse_status_' + taskInfos.status + ' .panel-body').append($taskRow);
                that.initTaskRow($taskRow);

            }
        }

        // Created tasks
        if (response.createdTaskInfos) {
            for (i = 0; i < response.createdTaskInfos.length; i++) {

                taskInfos = response.createdTaskInfos[i];

                if (that.plumb) {
                    $taskWidget = $(taskInfos.widget);
                    that.$canvas.append($taskWidget);
                    that.initTaskWidget($taskWidget);
                    $('.ladb-box', $taskWidget).effect('highlight', {}, 1500);
                }

                $taskRow = $(taskInfos.row);
                $('#collapse_status_' + taskInfos.status + ' .panel-body').append($taskRow);
                that.initTaskRow($taskRow);
                $('.ladb-box', $taskRow).effect('highlight', {}, 500);

            }
        }

        // Moved tasks
        if (response.movedTaskInfos && that.plumb) {
            for (i = 0; i < response.movedTaskInfos.length; i++) {

                taskInfos = response.movedTaskInfos[i];

                $taskWidget = $('#ladb_workflow_task_widget_' + taskInfos.id, that.$canvas);
                $taskWidget.css('left', taskInfos.positionLeft);
                $taskWidget.css('top', taskInfos.positionTop);

                that.plumb.repaint($taskWidget, { left:taskInfos.positionLeft, top:taskInfos.positionTop });

            }
        }

        // Updated tasks
        if (response.updatedTaskInfos) {
            for (i = 0; i < response.updatedTaskInfos.length; i++) {

                taskInfos = response.updatedTaskInfos[i];

                if (that.plumb) {
                    $taskWidget = $('#ladb_workflow_task_widget_' + taskInfos.id, that.$canvas);
                    $('.ladb-box', $taskWidget).replaceWith(taskInfos.box);
                    that.bindTaskBox(taskInfos.id, $('.ladb-box', $taskWidget));
                }

                $taskRow = $('#ladb_workflow_task_row_' + taskInfos.id);
                $('.ladb-box', $taskRow).replaceWith(taskInfos.box);
                that.appendToAnimate($taskRow, $('#collapse_status_' + taskInfos.status + ' .panel-body'));
                that.bindTaskBox(taskInfos.id, $('.ladb-box', $taskRow));

            }
        }

        // Deleted tasks
        if (response.deletedTaskId) {
            if (that.plumb) {
                $taskWidget = $('#ladb_workflow_task_widget_' + response.deletedTaskId);
                if ($taskWidget.length > 0) {
                    that.plumb.remove(TASK_WIDGET_PREFIX + response.deletedTaskId);
                }
            }
            $taskRow = $('#ladb_workflow_task_row_' + response.deletedTaskId);
            $taskRow.remove();
        }

        // Connections
        if (response.connections && that.plumb) {
            _.each(response.connections, function (connection) {
                that.plumb.connect({
                    source: TASK_WIDGET_PREFIX + connection.from,
                    target: TASK_WIDGET_PREFIX + connection.to
                });
            });
        }

        // Created connections
        if (response.createdConnections && that.plumb) {
            _.each(response.createdConnections, function (connection) {
                var sourceId = TASK_WIDGET_PREFIX + connection.from;
                var targetId = TASK_WIDGET_PREFIX + connection.to;
                that.plumb.detach({
                    source: sourceId,
                    target: targetId
                });
                that.plumb.connect({
                    source: sourceId,
                    target: targetId
                });
            });
        }

        // Deleted connections
        if (response.deletedConnections && that.plumb) {
            _.each(response.deletedConnections, function (connection) {
                that.plumb.detach({
                    source: TASK_WIDGET_PREFIX + connection.from,
                    target: TASK_WIDGET_PREFIX + connection.to
                });
            });
        }

        // Update section badges
        for (i = 1; i <= 4; ++i) {
            var $badgeStatus = $('#collapse_status_' + i + '_badge');
            var $collapse = $('#collapse_status_' + i);
            var count = $('.ladb-workflow-task-row', $collapse).length;
            $badgeStatus.html(count);
            if (count > 0) {
                $badgeStatus.show();
            } else {
                $badgeStatus.hide();
            }
        }

    };

    LadbWorkflowBoard.prototype.appendModalFromHtmlData = function(data) {
        var that = this;

        var $modal = $(data);

        // Append modal to body
        $('body').append($modal);

        // Bind modal
        $modal.on('shown.bs.modal', function() {
            $('input', $modal).focus();
        });
        $modal.on('hidden.bs.modal', function() {
            $modal.remove();
            that.removeFakeTask();
        });

        // Bind form
        var $form = $('form', $modal);
        $form.ajaxForm({
            cache: false,
            dataType: "html",
            context: document.body,
            clearForm: true,
            success: function (data, textStatus, jqXHR) {
                try {
                    JSON.parse(data);
                    that.removeFakeTask();
                } catch (error) {
                    that.appendModalFromHtmlData(data);
                }
                $modal.modal('hide');
            },
            error: function() {
                console.log('ERROR');
                that.removeFakeTask();
            }
        });

        // Bind submit button
        $('button[type=submit]', $modal).on('click', function() {
            $(this).button('loading');
            $form.submit();
        });

        // Bind remove button
        $('.ladb-btn-delete', $modal).on('click', function(e) {
            e.preventDefault();

            $(this).button('loading');

            // Sync with server
            $.ajax($(this).attr('href'), {
                cache: false,
                dataType: "html",
                context: document.body,
                success: function(data, textStatus, jqXHR) {
                    $modal.modal('hide');
                },
                error: function () {
                    console.log('ERROR');
                }
            });

        });

        // Show modal
        $modal.modal('show');

        // Hide loading
        this.unmarkLoading();

    };

    LadbWorkflowBoard.prototype.bindTaskBox = function(taskId, $taskBox) {
        var that = this;

        // Bind done and run button
        $('.ladb-status-update-btn', $taskBox).on('click', function (e) {

            $(this).button('loading');

            // Sync with server
            $.ajax(that.options.statusUpdateTaskPath, {
                type: "POST",
                cache: false,
                dataType: "html",
                context: document.body,
                data: {
                    taskId: taskId,
                    status: $(this).data('action-status')
                },
                error: function () {
                    console.log('ERROR');
                }
            });

        });

        // Bind edit button
        $('.ladb-btn-edit', $taskBox).on('click', function(e) {
            that.editTask(taskId);
        });

    };

    LadbWorkflowBoard.prototype.initTaskRow = function($taskRow) {

        var taskId = $taskRow.attr('id').substring('ladb_workflow_task_row_'.length);

        this.bindTaskBox(taskId, $('.ladb-box', $taskRow));
    };

    LadbWorkflowBoard.prototype.initTaskWidget = function($taskWidget) {
        var that = this;

        var taskId = $taskWidget.attr('id').substring(TASK_WIDGET_PREFIX.length);

        // Setup as plumb source and target

        this.plumb.makeSource($taskWidget, {
            filter: ".ladb-ep",
            endpoint: "Blank",
            anchor: "Bottom",
            connectorStyle: {stroke: "#5c96bc", strokeWidth: 2, outlineStroke: "transparent", outlineWidth: 6}
        });

        this.plumb.makeTarget($taskWidget, {
            dropOptions: {hoverClass: "jtk-drag-hover"},
            endpoint: "Blank",
            anchor: "Top",
            allowLoopback: false
        });

        // Bind box buttons

        this.bindTaskBox(taskId, $('.ladb-box', $taskWidget));

        // Bind ep button

        $('.ladb-ep', $taskWidget).on('click', function(e) {

            var currentScale = that.getCurrentScale();
            var positionLeft = (e.originalEvent.clientX - that.$canvas.offset().left) / currentScale - 150;    // 150 = half task widget width
            var positionTop = (e.originalEvent.clientY - that.$canvas.offset().top) / currentScale + 100;

            // Drop connection on the board -> new Task
            that.newTask(positionLeft, positionTop, taskId);

        });

        // Make widget draggable

        var currentScale = 1;
        $taskWidget.draggable({
            grid: [GRID_SPACING, GRID_SPACING],
            handle: ".ladb-box",
            start: function (e) {
                currentScale = that.getCurrentScale();
                $(this).draggable( "option", "grid", [ GRID_SPACING * currentScale, GRID_SPACING * currentScale ] );
                $(this).css("cursor", "move");
                that.$panzoom.panzoom("disable");
            },
            drag: function (e, ui) {
                ui.position.left = ui.position.left / currentScale;
                ui.position.top = ui.position.top / currentScale;
                if ($(this).hasClass("jtk-connected")) {
                    that.plumb.repaint($(this).attr('id'), ui.position);
                }
            },
            stop: function (e, ui) {
                var nodeId = $(this).attr('id');
                if ($(this).hasClass("jtk-connected")) {
                    that.plumb.repaint(nodeId, ui.position);
                }
                $(this).css("cursor", "");
                that.$panzoom.panzoom("enable");

                // Round coordinates to grid
                var positionLeft = Math.round(($taskWidget.position().left / currentScale) / GRID_SPACING) * GRID_SPACING ;
                var positionTop = Math.round(($taskWidget.position().top / currentScale) / GRID_SPACING) * GRID_SPACING;

                // Sync with server
                $.ajax(that.options.positionUpdateTaskPath, {
                    type: "POST",
                    cache: false,
                    dataType: "html",
                    context: document.body,
                    data: {
                        taskId: taskId,
                        positionLeft: positionLeft,
                        positionTop: positionTop
                    },
                    error: function () {
                        console.log('ERROR');
                    }
                });

            }
        });

    };

    LadbWorkflowBoard.prototype.appendFakeTask = function(positionLeft, positionTop, sourceTaskId) {
        if (!this.plumb) {
            return;
        }

        var $fakeTask = $('<div id="fake_task" class="ladb-workflow-task-widget"><div class="ladb-box ladb-status-0">&nbsp;</div></div>');
        $fakeTask.css('left', positionLeft + 'px');
        $fakeTask.css('top', positionTop + 'px');
        this.$canvas.append($fakeTask);

        if (sourceTaskId) {
            this.plumb.makeTarget($fakeTask, {
                endpoint: "Blank",
                anchor: "Top"
            });
            this.plumb.connect({
                source: TASK_WIDGET_PREFIX + sourceTaskId,
                target: 'fake_task'
            });
        }

    };

    LadbWorkflowBoard.prototype.removeFakeTask = function() {
        if (!this.plumb) {
            return;
        }

        var $fakeTask = $('#fake_task');
        if ($fakeTask.length > 0) {
            this.plumb.remove('fake_task');
        }

    };

    LadbWorkflowBoard.prototype.loadTasks = function() {
        var that = this;

        // Loading
        this.markLoading('Chargement des tâches...');

        $.ajax(that.options.listTaskPath, {
            cache: false,
            dataType: "html",
            context: document.body,
            success: function(data, textStatus, jqXHR) {

                // Hide loading
                that.unmarkLoading();

                that.updateBoardFromJsonData(data);
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.log('listTaskPath failed', textStatus);
            }
        });

    };

    LadbWorkflowBoard.prototype.newTask = function(positionLeft, positionTop, sourceTaskId) {
        var that = this;

        positionLeft = Math.round(positionLeft / 10) * 10;
        positionTop = Math.round(positionTop / 10) * 10;

        // Append the fake task
        this.appendFakeTask(positionLeft, positionTop, sourceTaskId);

        // Loading
        this.markLoading();

        $.ajax(that.options.newTaskPath, {
            cache: false,
            dataType: "html",
            context: document.body,
            data: {
                positionLeft: positionLeft,
                positionTop: positionTop,
                sourceTaskId: sourceTaskId
            },
            success: function(data, textStatus, jqXHR) {
                that.appendModalFromHtmlData(data);
            },
            error: function () {
                console.log('ERROR');
                that.removeFakeTask();
            }
        });

    };

    LadbWorkflowBoard.prototype.editTask = function(taskId) {
        var that = this;

        // Loading
        this.markLoading();

        $.ajax(that.options.editTaskPath, {
            type: "POST",
            cache: false,
            dataType: "html",
            context: document.body,
            data: {
                taskId: taskId
            },
            success: function(data, textStatus, jqXHR) {
                that.appendModalFromHtmlData(data);
            },
            error: function () {
                console.log('ERROR');
            }
        });

    };

    LadbWorkflowBoard.prototype.bind = function() {
        var that = this;

        // Init initiales tasks rows
        $('.ladb-workflow-task-row', that.$element).each(function (index) {
            that.initTaskRow($(this));
        });

        // Bind buttons
        this.$btnAddTask.on('click', function() {

            var positionLeft = that.$diagram.outerWidth() / 2 - that.$canvas.position().left - 150;
            var positionTop = that.$diagram.outerHeight() / 2 - that.$canvas.position().top - 30;

            that.newTask(positionLeft, positionTop);
        });

        // Bind loading mask
        this.$loadingPanel.on('mousedown', function(e) {
            e.stopImmediatePropagation();
        });

    };

    LadbWorkflowBoard.prototype.init = function() {
        var that = this;

        // Check capabilities
        if (!Modernizr.touchevents) {}
        if (!Modernizr.websockets) {}

        // Loading
        this.markLoading('Connexion...');

        // Connect WebSocket
        var ws = WS.connect(this.options.wsUri);
        ws.on('socket/connect', function(session) {

            // Keep ws session
            that.session = session;

            // Subscribe to the channel
            try {
                session.subscribe(that.options.wsChannel, function (uri, payload) {
                    try {
                        that.updateBoardFromJsonData(payload);
                    } catch(error) {
                        console.log("Error updating diagram", error);
                    }
                });

            } catch(error) {
                console.log("subscription failed", error);
            }

            // Load tasks
            that.loadTasks();

        });
        ws.on('socket/disconnect', function(error){

            // Reset ws session
            that.session = null;

            // Loading
            that.markLoading('Déconecté :(');

            notifyError('Disconnected for ' + error.reason + ' with code ' + error.code);

        });

        if (this.$canvas.is(':visible')) {

            jsPlumb.ready(function () {

                // Init jsPlumb
                that.plumb = jsPlumb.getInstance({
                    HoverPaintStyle: {stroke: "#f77f00", strokeWidth: 4},
                    Connector: ["Bezier", {curviness: 50, stub: 50}],
                    ConnectionOverlays: [
                        ["Arrow", {
                            location: 1,
                            id: "arrow",
                            width: 10,
                            length: 10,
                            foldback: 0.8
                        }]
                    ],
                    Container: that.$canvas
                });

                // Bind plumb
                that.plumb.bind('connection', function (info, originalEvent) {

                    if (!originalEvent || info.targetId == 'fake_task') {
                        return;
                    }

                    // Sync with server
                    $.ajax(that.options.createTaskConnectionPath, {
                        type: 'POST',
                        cache: false,
                        dataType: 'html',
                        context: document.body,
                        data: {
                            sourceTaskId: info.sourceId.substring(TASK_WIDGET_PREFIX.length),
                            targetTaskId: info.targetId.substring(TASK_WIDGET_PREFIX.length)
                        },
                        error: function () {
                            console.log('ERROR');
                        }
                    });

                });
                that.plumb.bind('connectionDrag', function (connection) {
                    console.log('connection', connection);
                });
                that.plumb.bind('connectionAborted', function (connection, originalEvent) {

                    var sourceTaskId = connection.sourceId.substring(TASK_WIDGET_PREFIX.length);

                    var currentScale = that.getCurrentScale();
                    var positionLeft = (originalEvent.clientX - that.$canvas.offset().left) / currentScale - 150;    // 150 = half task widget width
                    var positionTop = (originalEvent.clientY - that.$canvas.offset().top) / currentScale;

                    // Drop connection on the board -> new Task
                    that.newTask(positionLeft, positionTop, sourceTaskId);

                });
                that.plumb.bind('click', function (connection, originalEvent) {
                    that.plumb.detach(connection);

                    // Sync with server
                    $.ajax(that.options.deleteTaskConnectionPath, {
                        type: 'POST',
                        cache: false,
                        dataType: 'html',
                        context: document.body,
                        data: {
                            sourceTaskId: connection.sourceId.substring(TASK_WIDGET_PREFIX.length),
                            targetTaskId: connection.targetId.substring(TASK_WIDGET_PREFIX.length)
                        },
                        error: function () {
                            console.log('ERROR');
                        }
                    });

                });

                // Setup panzoom
                that.$panzoom.panzoom({
                    minScale: that.options.minScale,
                    maxScale: that.options.maxScale,
                    increment: that.options.incScale,
                    cursor: "",
                    ignoreChildrensEvents: true
                }).on("panzoomstart", function (e, panzoom, event, touches) {
                    that.$panzoom.css("cursor", "move");
                }).on("panzoomend", function (e, panzoom, matrix, changed) {
                    that.$panzoom.css("cursor", "");
                });
                that.$panzoom.parent()
                    .on('mousewheel.focal', function (e) {
                        e.preventDefault();
                        var delta = e.delta || e.originalEvent.wheelDelta;
                        var zoomOut = delta ? delta < 0 : e.originalEvent.deltaY > 0;
                        that.$panzoom.panzoom('zoom', zoomOut, {
                            animate: false,
                            focal: e
                        });
                        that.plumb.setZoom(that.getCurrentScale());
                    })
                    .on("mousedown", function (e) {
                        if (e.button > 0) {
                            return;
                        }
                        var matrix = that.$panzoom.panzoom("getMatrix");
                        var offsetX = matrix[4];
                        var offsetY = matrix[5];
                        var dragstart = {x: e.pageX, y: e.pageY, dx: offsetX, dy: offsetY};
                        $(e.target).css("cursor", "move");
                        $(this).data('dragstart', dragstart);
                    })
                    .on("touchstart", function (e) {
                        var matrix = that.$panzoom.panzoom("getMatrix");
                        var offsetX = matrix[4];
                        var offsetY = matrix[5];
                        var dragstart = {x: e.originalEvent.touches[0].pageX, y: e.originalEvent.touches[0].pageY, dx: offsetX, dy: offsetY};
                        $(this).data('dragstart', dragstart);
                    })
                    .on("mousemove", function (e) {
                        var dragstart = $(this).data('dragstart');
                        if (dragstart) {
                            var deltaX = dragstart.x - e.pageX;
                            var deltaY = dragstart.y - e.pageY;
                            var matrix = that.$panzoom.panzoom("getMatrix");
                            matrix[4] = parseInt(dragstart.dx) - deltaX;
                            matrix[5] = parseInt(dragstart.dy) - deltaY;
                            that.$panzoom.panzoom("setMatrix", matrix);
                        }
                    })
                    .on("touchmove", function (e) {
                        var dragstart = $(this).data('dragstart');
                        if (dragstart) {
                            var deltaX = dragstart.x - e.originalEvent.touches[0].pageX;
                            var deltaY = dragstart.y - e.originalEvent.touches[0].pageY;
                            var matrix = that.$panzoom.panzoom("getMatrix");
                            matrix[4] = parseInt(dragstart.dx) - deltaX;
                            matrix[5] = parseInt(dragstart.dy) - deltaY;
                            that.$panzoom.panzoom("setMatrix", matrix);
                        }
                    })
                    .on("mouseup touchend touchcancel mouseout", function (e) {
                        $(this).data('dragstart', null);
                        $(e.target).css("cursor", "");
                    })
                    .on('dblclick', function(e) {

                        var currentScale = that.getCurrentScale();
                        var positionLeft = (e.originalEvent.clientX - that.$canvas.offset().left) / currentScale - 150;    // 150 = half task widget width
                        var positionTop = (e.originalEvent.clientY - that.$canvas.offset().top) / currentScale;

                        that.newTask(positionLeft, positionTop);
                    });

            });

        }

        that.bind();

    };


    // PLUGIN DEFINITION
    // =======================

    function Plugin(option) {
        return this.each(function () {
            var $this   = $(this);
            var data    = $this.data('ladb.workflowboard');
            var options = $.extend({}, LadbWorkflowBoard.DEFAULTS, $this.data(), typeof option == 'object' && option);

            if (!data) {
                $this.data('ladb.workflowboard', (data = new LadbWorkflowBoard(this, options)));
            }
            if (typeof option == 'string') {
                data[option]();
            } else {
                data.init();
            }
        })
    }

    var old = $.fn.ladbWorkflowBoard;

    $.fn.ladbWorkflowBoard             = Plugin;
    $.fn.ladbWorkflowBoard.Constructor = LadbWorkflowBoard;


    // NO CONFLICT
    // =================

    $.fn.ladbWorkflowBoard.noConflict = function () {
        $.fn.ladbWorkflowBoard = old;
        return this;
    }

}(jQuery);