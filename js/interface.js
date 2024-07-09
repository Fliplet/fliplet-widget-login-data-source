
var widgetId = Fliplet.Widget.getDefaultId();
var data = Fliplet.Widget.getData(widgetId) || {};
var appId = Fliplet.Env.get('appId');
var isPublicApp = Fliplet.Navigate.query && Fliplet.Navigate.query.isPublicApp === 'true';
var planName = Fliplet.Navigate.query && Fliplet.Navigate.query.planName;
var dataSourceProvider = null;
var $dataColumnsEmail = $('#emailColumn');
var $dataColumnsPass = $('#passColumn');
var validInputEventName = 'interface-validate';
var page = Fliplet.Widget.getPage();
var omitPages = page ? [page.id] : [];
var $loggedInUserTime = $('#logged-in-user-time');
var $loggedOutUserTime = $('#logged-out-user-time');
var minutesInHour = 60;
var currentDataSource;
var initialLoadingDone = false;
var defaultExpireTimeout = 2880;
var loginActionProvider;
var registrationActionProvider;

var defaultEmailTemplate = $('#email-template-default').html();

var fields = [
  'emailColumn',
  'passColumn',
  'expireTimeout',
  'signupButtonLabel'
];

var tempColumnValues = {
  emailColumn: data['emailColumn'],
  passColumn: data['passColumn']
};

// TinyMCE INIT
tinymce.init({
  selector: '#validationEmail',
  plugins: [
    'lists advlist image charmap hr code',
    'searchreplace wordcount insertdatetime table textcolor colorpicker'
  ],
  toolbar: [
    'formatselect |',
    'bold italic underline strikethrough |',
    'forecolor backcolor |',
    'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent |',
    'blockquote subscript superscript | table insertdatetime charmap hr |',
    'removeformat | code'
  ].join(' '),
  menubar: false,
  statusbar: false,
  min_height: 300,
  setup: function(editor) {
    editor.on('init', function() {
      if ('emailTemplate' in data && data.emailTemplate !== '') {
        tinymce.get('validationEmail').setContent(data.emailTemplate);
      } else {
        tinymce.get('validationEmail').setContent(defaultEmailTemplate);
        data.emailTemplate = defaultEmailTemplate;
      }
    });
    editor.on('keyup paste', function() {
      data.emailTemplate = editor.getContent();
    });
  }
});

// 1. Fired from Fliplet Studio when the external save button is clicked
Fliplet.Widget.onSaveRequest(function() {
  dataSourceProvider.forwardSaveRequest();
});

// 2. Fired when the user submits the form
$('form').submit(function(event) {
  event.preventDefault();

  if (isPublicApp && (!data.registrationAction || data.registrationAction.page === 'none')) {
    Fliplet.Modal.alert({
      title: 'Registration screen required',
      message: 'Your app plan requires a registration button.<br>Please ensure you configure this button on the registration screen before launching your app.'
    });
  }

  loginActionProvider.forwardSaveRequest();
  registrationActionProvider.forwardSaveRequest();
});

function initLinkProviders() {
  var linkData = {
    action: 'screen',
    page: 'none',
    omitPages: omitPages,
    transition: 'fade',
    options: {
      hideAction: true
    }
  };

  if (loginActionProvider) {
    loginActionProvider.close();
    loginActionProvider = null;
  }

  if (registrationActionProvider) {
    registrationActionProvider.close();

    registrationActionProvider = null;
  }

  loginActionProvider = Fliplet.Widget.open('com.fliplet.link', {
    // If provided, the iframe will be appended here,
    // otherwise will be displayed as a full-size iframe overlay
    selector: '#login-link-action',
    // Also send the data I have locally, so that
    // the interface gets repopulated with the same stuff
    data: _.assign({}, linkData, data.loginAction),
    // Events fired from the provider
    onEvent: function(event, result) {
      if (event === 'interface-validate') {
        Fliplet.Widget.toggleSaveButton(result.isValid === true);
      }
    }
  });

  registrationActionProvider = Fliplet.Widget.open('com.fliplet.link', {
    // If provided, the iframe will be appended here,
    // otherwise will be displayed as a full-size iframe overlay
    selector: '#registration-link-action',
    // Also send the data I have locally, so that
    // the interface gets repopulated with the same stuff
    data: _.assign({}, linkData, data.registrationAction),
    // Events fired from the provider
    onEvent: function(event, result) {
      if (event === 'onPageChange') {
        if (data.value === 'none') {
          return;
        }

        data.registrationAction = _.assign({}, data.registrationAction, { page: result.value });
      }

      if (event === 'interface-validate') {
        Fliplet.Widget.toggleSaveButton(result.isValid === true);
      }
    }
  });

  Promise.all([loginActionProvider, registrationActionProvider]).then(function(results) {
    data.loginAction = results[0].data;
    data.registrationAction = results[1].data;

    save(true);
  });
}

function initDataSourceProvider(currentDataSourceId) {
  var dataSourceData = {
    dataSourceTitle: 'Login data source',
    dataSourceId: currentDataSourceId,
    appId: Fliplet.Env.get('appId'),
    default: {
      name: 'Login data for ' + Fliplet.Env.get('appName'),
      entries: [],
      columns: []
    },
    accessRules: []
  };

  if (currentDataSourceId) {
    Fliplet.DataSources.getById(currentDataSourceId).then(function(dataSource) {
      currentDataSource = dataSource;
    });
  }

  dataSourceProvider = Fliplet.Widget.open('com.fliplet.data-source-provider', {
    selector: '#dataSourceProvider',
    data: dataSourceData,
    onEvent: function(event, dataSource) {
      if (typeof dataSource.definition !== 'undefined' && dataSource.definition.sessionMaxDurationMinutes) {
        $loggedInUserTime.val(dataSource.definition.sessionMaxDurationMinutes / minutesInHour);
      }

      if (typeof dataSource.definition !== 'undefined' && dataSource.definition.sessionIdleTimeoutMinutes) {
        $loggedOutUserTime.val(dataSource.definition.sessionIdleTimeoutMinutes);
      }

      if (event === 'dataSourceSelect') {
        $dataColumnsEmail.html(
          '<option selected value="">-- Select email column</option>'
        );
        $dataColumnsPass.html(
          '<option selected value="">-- Select password column</option>'
        );

        // Appends Column Titles to new Select Box
        if (dataSource.columns) {
          dataSource.columns.forEach(function(column) {
            renderDataSourceColumn(column);
          });
        }

        if (data.passColumn || data.emailColumn) {
          $dataColumnsEmail.val(data.emailColumn);
          $dataColumnsPass.val(data.passColumn);
        }

        currentDataSource = dataSource.id ? dataSource : null;

        $('#select-email-field').toggleClass('hidden', !dataSource.id);
        $('#select-pass-field').toggleClass('hidden', !dataSource.id);
      }
    }
  });

  dataSourceProvider.then(function(dataSource) {
    data.dataSource = dataSource.data.id;
    $('form').submit();
  });
}

// Converts minutes to hours or days or weeks
function setReadableExpirePeriod(value) {
  var timeInterval = '1';

  if (value % 60 === 0 && value > 0) {
    // Converts to hours
    value = value / 60;
    timeInterval = '60';

    if (value % 24 === 0) {
      // Converts to days
      value = value / 24;
      timeInterval = '1440';

      if (value % 7 === 0) {
        // Converts to weeks
        value = value / 7;
        timeInterval = '10080';
      }
    }
  }

  $('#expire-timeout').val(value);
  $('#time-value').val(timeInterval);
}

// Converts time to minutes depending on selected hours or days or weeks
function convertTimeToMinutes() {
  var inputValue = $('#expire-timeout').val();
  var selectValue = $('#time-value').val();

  return inputValue * selectValue;
}

// Shows warning if security setting are not configured correctly
function checkSecurityRules() {
  Fliplet.API.request('v1/apps/' + appId).then(function(result) {
    if (!result || !result.app) {
      return;
    }

    var hooks = _.get(result.app, 'hooks', []);
    var isSecurityConfigured = _.some(hooks, function(hook) {
      return hook.script.indexOf(page.id) !== -1;
    });

    if (!hooks.length) {
      $('#security-alert span').text('app has no security rules configured to prevent unauthorized access.');
    }

    $('#security-alert').toggleClass('hidden', isSecurityConfigured);
  });
}

function save(notifyComplete) {
  // Get and save values to data
  _.forEach(fields, function(fieldId) {
    if (fieldId === 'expireTimeout') {
      data[fieldId] = $('#expire-timeout').val() ? convertTimeToMinutes() : defaultExpireTimeout;

      return;
    }

    data[fieldId] = $('#' + fieldId).val();
  });

  var updateDataSource = Promise.resolve();

  if (currentDataSource) {
    var definition = currentDataSource.definition || {};
    var validation = {
      email: {
        domain: false,
        expire: convertTimeToMinutes(),
        domains: [],
        template: {
          to: [],
          html: data.emailTemplate || defaultEmailTemplate,
          subject: 'Validate your email address'
        },
        toColumn: data.emailColumn,
        matchColumn: data.emailColumn,
        passwordColumn: data.passColumn
      }
    };

    definition.validation = validation;

    // Update definition to make sure the password never gets sent
    // to apps when fetching data for this dataSource.
    if (data.passColumn) {
      if (!Array.isArray(definition.exclude)) {
        definition.exclude = [];
      }

      definition.exclude = _.compact(_.uniq(definition.exclude.concat([data.passColumn])));
    }

    // convert hours into minutes
    definition.sessionMaxDurationMinutes = $loggedInUserTime.val() !== ''
      ? $loggedInUserTime.val() * minutesInHour
      : '';
    definition.sessionIdleTimeoutMinutes = $loggedOutUserTime.val();

    // Update data source definitions
    var options = { id: data.dataSource, definition: definition };

    updateDataSource = Fliplet.DataSources.update(options);
  }

  data.hasSignupScreen = isPublicApp
    ? !!(data.registrationAction && data.registrationAction.page)
    : data.registrationAction && data.registrationAction.page !== 'none';

  return updateDataSource.then(function() {
    return Fliplet.Widget.save(data).then(function() {
      if (notifyComplete) {
        Fliplet.Widget.complete();
        window.location.reload();
      } else {
        Fliplet.Studio.emit('reload-widget-instance', widgetId);
      }
    });
  });
}

Fliplet.Widget.emit(validInputEventName, {
  isValid: false
});

function renderDataSourceColumn(dataSourceColumn) {
  $dataColumnsEmail.append(
    '<option value="' + dataSourceColumn + '">' + dataSourceColumn + '</option>'
  );
  $dataColumnsPass.append(
    '<option value="' + dataSourceColumn + '">' + dataSourceColumn + '</option>'
  );
}

function syncTempColumns(columnType) {
  tempColumnValues[columnType] = $('#' + columnType).val();
}

$('#emailColumn, #passColumn').on('change', function() {
  var selectedValue = $(this).val();
  var selectedText = $(this).find('option:selected').text();

  $(this).parents('.select-proxy-display').find('.select-value-proxy').html(selectedText);

  syncTempColumns($(this).attr('id'));

  Fliplet.Widget.emit(validInputEventName, {
    isValid: selectedValue !== 'none'
  });
});

$('#allow_reset').on('change', function() {
  var checked = $(this).prop('checked');

  $('.reset-pass-redirect').toggleClass('hidden', !checked);
  $('.expire-timeout-settings').toggleClass('hidden', !checked);
  data.allowReset = checked;

  if (initialLoadingDone) {
    save();
  }

  initialLoadingDone = true;
});

$('#allow_show_password').on('change', function() {
  var checked = $(this).prop('checked');

  data.allowShowPassword = checked;

  if (initialLoadingDone) {
    save();
  }

  initialLoadingDone = true;
});

// Open security overlay
$('#security-alert u').on('click', function() {
  Fliplet.Studio.emit('overlay', {
    name: 'app-settings',
    options: {
      title: 'App Settings',
      size: 'large',
      section: 'appSecurity',
      appId: appId
    }
  });
});

function initializeData() {
  checkSecurityRules();

  _.forEach(fields, function(fieldId) {
    if (fieldId === 'expireTimeout') {
      setReadableExpirePeriod(data[fieldId] || defaultExpireTimeout);
    } else if (data[fieldId]) {
      $('#' + fieldId).val(data[fieldId]).change();
    }
  });

  if (data.allowReset) {
    $('#allow_reset').trigger('change');
  }

  $('.plan-name').text(planName);

  if (!isPublicApp) {
    $('#registration-alert').addClass('hidden');
    $('.registration-optional-label').removeClass('hidden');
  }
}

// Preveting entering invalid values in the expiration input
$('#expire-timeout').on('keydown', function(event) {
  return event.keyCode === 8 || /[0-9]+/.test(event.key);
});

$('[data-toggle="tooltip"]').tooltip();

$('.upgrade-plan').on('click', function() {
  Fliplet.Studio.emit('overlay', {
    name: 'app-settings',
    options: {
      size: 'large',
      title: 'App Settings',
      appId: appId,
      section: 'appBilling',
      helpLink: 'https://help.fliplet.com/app-settings/'
    }
  });

  Fliplet.Studio.emit('track-event', {
    category: 'app_billing',
    action: 'open_overlay',
    context: 'login_component'
  });
});

function init() {
  initDataSourceProvider(data.dataSource);
  initLinkProviders();
  initializeData();

  $('.spinner-holder').removeClass('animated');
}

init();
