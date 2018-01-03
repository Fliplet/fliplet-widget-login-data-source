$('[data-login-ds-id]').each(function() {
  var _this = this;
  var $container = $(this);
  var widgetId = $container.attr('data-login-ds-id');
  var containerSelector = '[data-login-ds-id="'+widgetId+'"]';
  var widgetUuid = $container.attr('data-login-ds-uuid');
  var data = Fliplet.Widget.getData(widgetId);
  var dataSourceEntry; // Data source entry after user verify email

  this.pvName = 'login_data_source_component_' + Fliplet.Env.get('appId');
  var dataStructure = {
    auth_token: '',
    id: '',
    email: '',
    createdAt: null
  };

  var CODE_VALID = 30,
    APP_NAME = Fliplet.Env.get('appName'),
    APP_VALIDATION_DATA_DIRECTORY_ID = data.dataSource,
    DATA_DIRECTORY_EMAIL_COLUMN = data.emailColumn,
    DATA_DIRECTORY_PASS_COLUMN = data.passColumn,
    ORG_NAME = Fliplet.Env.get('organizationName');

  if (Fliplet.Navigate.query.error) {
    $(containerSelector).find('.login-error').html(Fliplet.Navigate.query.error).removeClass('hidden');
  }

  function initEmailValidation() {
    Fliplet.Navigator.onReady().then(function() {
      Fliplet.Security.Storage.init().then(function() {
        attachEventListeners();
        setUserDataPV(function() {}, function() {});
      });

      // New logic to redirect
      // Check if user is already verified
      if (!Fliplet.Env.get('disableSecurity')) {
        Fliplet.User.getCachedSession()
          .then(function(session) {
            if (session && session.accounts && session.accounts.dataSource) {
              var verifiedAccounts = session.accounts.dataSource.filter(function (dataSourceAccount) {
                return dataSourceAccount.id === APP_VALIDATION_DATA_DIRECTORY_ID;
              });

              if (verifiedAccounts.lenght) {
                setTimeout(function() {
                  Fliplet.Navigate.to(data.action);
                }, 1000);
              }
            }
          });
      }
    });
  }

  function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }

  function calculateElHeight(el) {

    var elementHeight = el.outerHeight();
    el.parents('.fl-restore-pass').css('height', elementHeight);

    if (el.hasClass('start')) {
      el.removeClass('start').addClass('present');
    }

  }

  function loginFromDataSource(data_source_id, where, success_callback, fail_callback) {
    return Fliplet.Session.authorize({
      passport: "dataSource",
      dataSourceId: data_source_id,
      where: where
    })
      .then(function(authorization) {
        success_callback(authorization.session.entries.dataSource)
      })
      .catch(function() {
        fail_callback(true);
      });
  }

  function resetFromDataSource(data_source_id, where, success_callback, fail_callback) {
    Fliplet.DataSources.connect(data.dataSource, { offline: false })
      .then(function(dataSource) {
        dataSource.sendValidation({type: 'email', where: where})
          .then(success_callback)
          .catch(function () {
            fail_callback(true);
          });
      });
  }

  function attachEventListeners() {

    $(containerSelector).on('click', '.btn-login', function() {
      var _this = $(this);
      _this.parents('.form-btns').find('.login-error').addClass('hidden');

      window.profileEmail = $(containerSelector).find('input.profile_email').val().toLowerCase(); // GET EMAIL VALUE
      window.profilePassword = $(containerSelector).find('input.profile_password').val();

      // Triggers loading
      $(this).addClass('loading');
      $(this).find('span').addClass('hidden');
      $(this).find('.loader').addClass('show');

      if (validateEmail(profileEmail)) {
        // CHECK FOR EMAIL ON DATA SOURCE
        var where = {};
        where[DATA_DIRECTORY_EMAIL_COLUMN] = profileEmail;
        where[DATA_DIRECTORY_PASS_COLUMN] = profilePassword;
        loginFromDataSource(APP_VALIDATION_DATA_DIRECTORY_ID, where, function(entry) {
          // Reset Login button
          userDataPV.entry = entry;
          userDataPV.userLogged = true;
          // Set PV to be used by Chat
          Fliplet.App.Storage.set({
            'fl-chat-source-id': entry.dataSourceId,
            'fl-chat-auth-email': profileEmail,
            'fl-login-data-source': entry
          });
          Fliplet.Profile.set('email', profileEmail);
          Fliplet.Security.Storage.update().then(function() {

            _this.removeClass('loading');
            _this.find('span').removeClass('hidden');
            _this.find('.loader').removeClass('show');

            if (typeof data.loginAction !== "undefined" && !Fliplet.Env.get('disableSecurity')) {
              Fliplet.Navigate.to(data.loginAction);
            }

          });
        }, function(error) {
          // Reset Login button
          _this.removeClass('loading');
          _this.find('span').removeClass('hidden');
          _this.find('.loader').removeClass('show');
          _this.parents('.form-btns').find('.login-error').html("Your email or password don't match. Please try again.").removeClass('hidden');
        });
      } else {
        // INVALID EMAIL

        // Reset Login button
        _this.removeClass('loading');
        _this.find('span').removeClass('hidden');
        _this.find('.loader').removeClass('show');
        // Show error
        _this.parents('.form-btns').find('.login-error').html("Please enter a valid email.").removeClass('hidden');
      }
    });

    // EVENT LISTENER FOR FORGET PASSWORD RESET
    // Just switches views Login to Email verification
    // Leave as it is
    $(containerSelector).on('click', '.btn-forget-pass', function() {
      $(containerSelector).find('.fl-login-holder').fadeOut(100, function() {
        $(containerSelector).find('.fl-restore-pass').fadeIn(300);
        calculateElHeight($(containerSelector).find('.state[data-state=verify-email]'));
      });
    });


    $(containerSelector).on('click', '.back-login', function() {
      $(containerSelector).find('.fl-restore-pass').fadeOut(100, function() {
        $(containerSelector).find('.fl-login-holder').fadeIn(250);

        // Reset states of email verification
        $(containerSelector).find('.reset-email-error').addClass('hidden');
        $(containerSelector).find('.pin-verify-error').addClass('hidden');
        $(containerSelector).find('.pin-sent-error').addClass('hidden');
        $(containerSelector).find('.state').removeClass('present past').addClass('future');
        $(containerSelector).find('.state[data-state=verify-email]').removeClass('future').addClass('start');
      });
    });

    $(containerSelector).on('click', '.verify-identity', function(event) {
      var _this = $(this);
      _this.addClass("disabled");

      window.resetEmail = $(containerSelector).find('input.reset-email-field').val().toLowerCase(); // Get email for reset

      $(containerSelector).find('.reset-email-error').addClass('hidden');
      // EMAIL FOUND ON DATA SOURCE
      if ($(containerSelector).find('.state[data-state=verify-email] .form-group').hasClass('has-error')) {
        $(containerSelector).find('.state[data-state=verify-email] .form-group').removeClass('has-error');
      }

      // VALIDATE EMAIL
      if (validateEmail(resetEmail)) {
        // CHECK FOR EMAIL ON DATA SOURCE
        var where = {};
        where[DATA_DIRECTORY_EMAIL_COLUMN] = resetEmail;
        resetFromDataSource(APP_VALIDATION_DATA_DIRECTORY_ID, where, function(entry) {
          if ($(containerSelector).find('.state[data-state=verify-email] .form-group').hasClass('has-error')) {
            $(containerSelector).find('.state[data-state=verify-email] .form-group').removeClass('has-error');
          }
          $(containerSelector).find('.state[data-state=verify-email]').removeClass('present').addClass('past');
          $(containerSelector).find('.verify-user-email').text(resetEmail); // UPDATES TEXT WITH EMAIL
          _this.removeClass("disabled");
          calculateElHeight($(containerSelector).find('.state[data-state=verify-code]'));
          $(containerSelector).find('.state[data-state=verify-code]').removeClass('future').addClass('present');
          
        }, function(error) {
          // EMAIL NOT FOUND ON DATA SOURCE
          _this.removeClass("disabled");
          $(containerSelector).find('.reset-email-error').html("We couldn't find your email in our system. Please try again.").removeClass('hidden');
          $(containerSelector).find('.state[data-state=verify-email] .form-group').addClass('has-error');
          calculateElHeight($(containerSelector).find('.state[data-state=verify-email]'));
        });

      } else {
        // INVALID EMAIL
        _this.removeClass("disabled");
        $(containerSelector).find('.reset-email-error').html("Please enter a valid email address and try again.").removeClass('hidden');
        $(containerSelector).find('.state[data-state=verify-email] .form-group').addClass('has-error');
        calculateElHeight($(containerSelector).find('.state[data-state=verify-email]'));
      }
    });

    $(containerSelector).on('click', '.back.start', function() {
      $(containerSelector).find('.state.present').removeClass('present').addClass('future');

      $(containerSelector).find('.reset-email-field').val(""); // RESETS EMAIL VALUE
      $(containerSelector).find('.pin-code-field').val(""); // RESETS PIN

      // REMOVES ERROR MESSAGE ON CURRENT STATE IF THERE IS ONE
      if ($(containerSelector).find('.state[data-state=verify-code] .form-group').hasClass('has-error')) {
        $(containerSelector).find('.state[data-state=verify-code] .form-group').removeClass('has-error');
      }

      //check the validation current state.
      if (userDataPV.code !== "" && userDataPV.code_generated_at > Date.now() - (CODE_VALID * 60 * 1000)) {
        $(containerSelector).find('.have-code').removeClass('hidden');
      }
      //$(containerSelector).find('.verify-code').html("Verify").removeClass("disabled");
      $(containerSelector).find('.authenticate').removeClass('loading');
      $(containerSelector).find('.authenticate').find('span').removeClass('hidden');
      $(containerSelector).find('.authenticate').find('.loader').removeClass('show');

      calculateElHeight($(containerSelector).find('.state[data-state=verify-email]'));
      $(containerSelector).find('.state[data-state=verify-email]').removeClass('past').addClass('present');
    });

    $(containerSelector).on('click', '.have-code', function() {
      // TRANSITION
      $(containerSelector).find('.state.present').removeClass('present').addClass('past');
      $(containerSelector).find('.verify-user-email').text(userDataPV.email); // UPDATES TEXT WITH EMAIL

      calculateElHeight($(containerSelector).find('.state[data-state=verify-code]'));
      $(containerSelector).find('.state[data-state=verify-code]').removeClass('future').addClass('present');
    });

    $(containerSelector).on('click', '.authenticate', function() {
      var _this = $(this);

      $(containerSelector).find('.pin-verify-error').addClass('hidden');
      $(containerSelector).find('.pin-sent-error').addClass('hidden');
      // Simulates loading
      $(this).addClass('loading');
      $(this).find('span').addClass('hidden');
      $(this).find('.loader').addClass('show');

      var code = $(containerSelector).find('.pin-code-field').val();
      Fliplet.DataSources.connect(data.dataSource, { offline: false })
        .then(function(dataSource) {
          var where = { code: code };
          where[data.emailColumn] = resetEmail;
          
          Fliplet.Session.get()
            .then(function() {
              dataSource.validate({ type: 'email', where: where })
                .then(function(entry) {
                  dataSourceEntry = entry;
                  return Promise.all([
                    Fliplet.App.Storage.set('fl-chat-source-id', entry.dataSourceId),
                    Fliplet.App.Storage.set('fl-chat-auth-email', resetEmail),
                    Fliplet.App.Storage.set('fl-email-verification', entry),
                    Fliplet.Profile.set('email', resetEmail),
                    Fliplet.Hooks.run('onUserVerified', { entry: entry })
                  ]);
                })
                .then(function() {
                  if ($(containerSelector).find('.state[data-state=verify-code] .form-group').hasClass('has-error')) {
                    $(containerSelector).find('.state[data-state=verify-code] .form-group').removeClass('has-error');
                  }
        
                  userDataPV.resetVerified = true;
                  userDataPV.code = "";
                  userDataPV.code_generated_at = "";
                  Fliplet.Security.Storage.update().then(function() {
                    _this.removeClass('loading');
                    _this.find('span').removeClass('hidden');
                    _this.find('.loader').removeClass('show');
        
                    $(containerSelector).find('.state.present').removeClass('present').addClass('past');
                    calculateElHeight($(containerSelector).find('.state[data-state=reset-password]'));
                    $(containerSelector).find('.state[data-state=reset-password]').removeClass('future').addClass('present');
        
                    // Analytics - Info Event
                    Fliplet.Analytics.info({
                      email: userDataPV.email,
                      action: 'search'
                    });
                  });
                })
                .catch(function(error) {
                  $(containerSelector).find('.state[data-state=verify-code] .form-group').addClass('has-error');
                  $(containerSelector).find('.resend-code').removeClass('hidden');
                  _this.removeClass('loading');
                  _this.find('span').removeClass('hidden');
                  _this.find('.loader').removeClass('show');
                  $(containerSelector).find('.pin-verify-error').removeClass('hidden');
                  calculateElHeight($(containerSelector).find('.state[data-state=verify-code]'));
                });
            })
        });  
    });

    // UPDATE PASSWORD
    $(containerSelector).on('click', '.update-password', function() {
      var _this = $(this);

      $(containerSelector).find('.reset-password-error').addClass('hidden');

      // Simulates loading
      $(this).addClass('loading');
      $(this).find('span').addClass('hidden');
      $(this).find('.loader').addClass('show');

      var newPassword = $(containerSelector).find('.new-password').val();
      var confirmPassword = $(containerSelector).find('.confirm-password').val();

      if (newPassword || confirmPassword) {
        if (newPassword === confirmPassword) {
          Fliplet.Session.get().then(function (session) {
            if (session.entries && session.entries.dataSource) {
              entryId = 'session'; // this works because you can use it as an ID on the backend
              entry = session.entries.dataSource;
              return Fliplet.DataSources.connect(data.dataSource, { offline: false }).then(function(dataSource) {
                var options = {
                  type: 'update',
                  where: {},
                  dataSourceEntryId: dataSourceEntry.id,
                  data: {}
                };
                options.where[data.emailColumn] = resetEmail;
                options.data[data.passColumn] = newPassword;
                return dataSource.query(options)
                  .then(function onPasswordUpdateSuccess() {
                    _this.removeClass('loading');
                    _this.find('span').removeClass('hidden');
                    _this.find('.loader').removeClass('show');
          
                    $(containerSelector).find('.state.present').removeClass('present').addClass('past');
                    calculateElHeight($(containerSelector).find('.state[data-state=all-done]'));
                    $(containerSelector).find('.state[data-state=all-done]').removeClass('future').addClass('present');
                  })
                  .catch(function onPasswordUpdateError (error) {
                    // Query failed due to some datasource missconfiguration or access denied
                    _this.removeClass('loading');
                    _this.find('span').removeClass('hidden');
                    _this.find('.loader').removeClass('show');
  
                    $(containerSelector).find('.reset-password-error').html('Something went wrong! Try again.');
                    $(containerSelector).find('.reset-password-error').removeClass('hidden');
                  });
              });
            } else {
              // User tried to update password without being verified
              _this.removeClass('loading');
              _this.find('span').removeClass('hidden');
              _this.find('.loader').removeClass('show');
  
              $(containerSelector).find('.state.present').removeClass('present').addClass('future');
  
              $(containerSelector).find('.reset-email-field').val(""); // RESETS EMAIL VALUE
              $(containerSelector).find('.pin-code-field').val(""); // RESETS PIN
  
              //check the validation current state.
              if (userDataPV.code !== "" && userDataPV.code_generated_at > Date.now() - (CODE_VALID * 60 * 1000)) {
                $(containerSelector).find('.have-code').removeClass('hidden');
              }
  
              $(containerSelector).find('.authenticate').removeClass('loading');
              $(containerSelector).find('.authenticate').find('span').removeClass('hidden');
              $(containerSelector).find('.authenticate').find('.loader').removeClass('show');
  
              $(containerSelector).find('.reset-email-error').html("You need to verify your email first.").removeClass('hidden');
              $(containerSelector).find('.state[data-state=verify-email] .form-group').addClass('has-error');
  
              calculateElHeight($(containerSelector).find('.state[data-state=verify-email]'));
              $(containerSelector).find('.state[data-state=verify-email]').removeClass('past').addClass('present');
            }
          });
        } else {
          $(containerSelector).find('.reset-password-error').html('Passwords don\'t match. Please try again.');
          $(containerSelector).find('.reset-password-error').removeClass('hidden');

          // Removes loading
          $(this).removeClass('loading');
          $(this).find('span').removeClass('hidden');
          $(this).find('.loader').removeClass('show');

          calculateElHeight($(containerSelector).find('.state[data-state=reset-password]'));
        }
      } else {
        $(containerSelector).find('.reset-password-error').html('Enter a new password and confirm. Try again.');
        $(containerSelector).find('.reset-password-error').removeClass('hidden');

        // Removes loading
        $(this).removeClass('loading');
        $(this).find('span').removeClass('hidden');
        $(this).find('.loader').removeClass('show');

        calculateElHeight($(containerSelector).find('.state[data-state=reset-password]'));
      }
    });

    $(containerSelector).on('click', '.resend-code', function() {
      $(containerSelector).find('.pin-sent-error').addClass('hidden');
      $(containerSelector).find('.pin-sent-success').addClass('hidden');
      $(containerSelector).find('.pin-code-field').val("");
      if ($(containerSelector).find('.state[data-state=verify-code] .form-group').hasClass('has-error')) {
        $(containerSelector).find('.state[data-state=verify-code] .form-group').removeClass('has-error');
      }
      if (!$(containerSelector).find('.resend-code').hasClass('hidden')) {
        $(containerSelector).find('.resend-code').addClass('hidden');
      }

      calculateElHeight($(containerSelector).find('.state[data-state=verify-code]'));

      Fliplet.DataSources.connect(data.dataSource, { offline: false })
        .then(function(dataSource) {
          var where = {};
          where[data.emailColumn] = resetEmail;
          dataSource.sendValidation({ type: type, where: where })
          .then(function () {
              $(containerSelector).find('.pin-code-field').val("");
              $(containerSelector).find('.pin-sent-success').removeClass('hidden');
              if ($(containerSelector).find('.state[data-state=verify-code] .form-group').hasClass('has-error')) {
                $(containerSelector).find('.state[data-state=verify-code] .form-group').removeClass('has-error');
              }
              if (!$(containerSelector).find('.resend-code').hasClass('hidden')) {
                $(containerSelector).find('.resend-code').addClass('hidden');
              }
          })
          .catch(function () {
              $(containerSelector).find('.pin-sent-error').text(CONTACT_UNREACHABLE).removeClass("hidden");
          });
        });
    });
  }

  function setUserDataPV(success_callback, fail_callback) {
    var structure = {
      resetVerified: false,
      code: "",
      code_generated_at: "",
      email: "",
      userLogged: false
    };

    window.pvName = "login-data-source";
    Fliplet.Security.Storage.create(pvName, structure).then(function(data) {
      window.userDataPV = data;
      success_callback();
    }, fail_callback);

  }

  Fliplet().then(function () {
    initEmailValidation();

    if (Fliplet.Env.get('interact')) {
      // Disables password fields in edit mode to avoid password autofill
      $('input[type="password"]').prop('disabled', true);
    }

    if (Fliplet.Env.is('web')) {
      $(containerSelector).on('fliplet_page_reloaded', initEmailValidation);
    }
  });
});
