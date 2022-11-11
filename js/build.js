Fliplet.Widget.instance('login-ds', function(data) {
  window.userDataPV = window.userDataPV || {};

  var $container = $(this);
  var userDataPV = window.userDataPV;
  var resetEmail;
  var isValidPassword;
  var $newPasswordInput = $('.new-password');
  var $confirmPasswordInput = $('.confirm-password');
  var $newPasswordChecker = $('.panel.password-checker');
  var $confirmPasswordChecker = $('.password-confirmation');
  var $passwordLengthCkecker = $('.password-length');
  var $passwordUppercaseCkecker = $('.password-uppercase');
  var $passwordLowercaseCkecker = $('.password-lowercase');
  var $passwordNumberCkecker = $('.password-number');
  var $passwordSpecialCkecker = $('.password-special');
  var $passwordConfirmChecker = $('.password-confirmation-check');

  var rules = {
    passwordMinLength: /.{8,}/,
    isUppercase: /[A-Z]/,
    isLowercase: /[a-z]/,
    isNumber: /[0-9]/,
    isSpecial: /[^A-Za-z0-9]/
  };

  var dataSourceEntry; // Data source entry after user verify email

  // Do not track login related redirects
  if (typeof data.loginAction !== 'undefined') {
    data.loginAction.track = false;
  }

  this.pvName = 'login_data_source_component_' + Fliplet.Env.get('appId');

  var CODE_VALID = 30;
  var APP_VALIDATION_DATA_DIRECTORY_ID = parseInt(data.dataSource, 10);
  var DATA_DIRECTORY_EMAIL_COLUMN = data.emailColumn;
  var DATA_DIRECTORY_PASS_COLUMN = data.passColumn;

  if (Fliplet.Navigate.query.error) {
    $container.find('.login-error').html(Fliplet.Navigate.query.error).removeClass('hidden');
  }

  function validatePassword() {
    var passwordValue = $newPasswordInput.val();

    $passwordLengthCkecker.attr('checked', rules.passwordMinLength.test(passwordValue));
    $passwordUppercaseCkecker.attr('checked', rules.isUppercase.test(passwordValue));
    $passwordLowercaseCkecker.attr('checked', rules.isLowercase.test(passwordValue));
    $passwordNumberCkecker.attr('checked', rules.isNumber.test(passwordValue));
    $passwordSpecialCkecker.attr('checked', rules.isSpecial.test(passwordValue));

    var isInvalid = _.some(rules, function(value) {
      return !value.test(passwordValue);
    });

    isValidPassword = !isInvalid;
  }

  function validatePasswordConfirmation() {
    var password = $newPasswordInput.val();
    var confirmation = $confirmPasswordInput.val();

    $passwordConfirmChecker.attr('checked', confirmation === password && !!confirmation);
  }

  function initEmailValidation() {
    Fliplet.Security.Storage.init().then(function() {
      attachEventListeners();
      setUserDataPV(function() {}, function() {});
    });

    // New logic to redirect
    // Check if user is already verified
    if (!Fliplet.Env.get('disableSecurity')) {
      Fliplet.User.getCachedSession({ force: true })
        .then(function(session) {
          if (!session || !session.accounts) {
            return Promise.reject(T('widgets.login.dataSource.errors.sessionNotFound'));
          }

          var dataSource = session.accounts.dataSource || [];
          var verifiedAccounts = dataSource.filter(function(dataSourceAccount) {
            return dataSourceAccount.dataSourceId === APP_VALIDATION_DATA_DIRECTORY_ID;
          });

          if (!verifiedAccounts.length) {
            return Promise.reject(T('widgets.login.dataSource.errors.sessionNotFound'));
          }

          // Update stored email address based on retrieved session
          var entry = verifiedAccounts[0];
          var email = entry.data[DATA_DIRECTORY_EMAIL_COLUMN];
          var user = createUserProfile(entry);

          return Promise.all([
            Fliplet.App.Storage.set({
              'fl-chat-source-id': entry.dataSourceId,
              'fl-chat-auth-email': email,
              'fl-login-data-source': entry
            }),
            Fliplet.Profile.set({
              'email': email,
              'user': user
            }),
            Fliplet.Security.Storage.update()
          ]);
        })
        .then(function() {
          if (typeof data.loginAction === 'undefined') {
            return Promise.reject(T('widgets.login.dataSource.errors.redirectMissing'));
          }

          var navigate = Fliplet.Navigate.to(data.loginAction);

          if (typeof navigate === 'object' && typeof navigate.then === 'function') {
            return navigate;
          }

          return Promise.resolve();
        })
        .catch(function(error) {
          console.warn(error);
        });
    }
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

  function loginFromDataSource(dataSourceId, where) {
    return Fliplet.Session.authorize({
      passport: 'dataSource',
      dataSourceId: dataSourceId,
      where: where
    })
      .catch(function(error) {
        return Promise.reject(error);
      });
  }

  function resetFromDataSource(dataSourceId, where) {
    return Fliplet.DataSources.connect(data.dataSource, { offline: false })
      .then(function(dataSource) {
        return dataSource.sendValidation({ type: 'email', where: where });
      });
  }

  function createUserProfile(entry) {
    entry = entry || {};

    if (!entry.dataSourceId || !entry.id) {
      return;
    }

    return {
      type: 'dataSource',
      dataSourceId: entry.dataSourceId,
      dataSourceEntryId: entry.id
    };
  }

  function attachEventListeners() {
    $container.on('submit', '.fl-login-form form', function(e) {
      e.preventDefault();

      var _this = $(this);

      _this.find('.login-error').addClass('hidden');

      var profileEmail = $container.find('input.profile_email').val().toLowerCase();
      var profilePassword = $container.find('input.profile_password').val();

      // Triggers loading
      $(this).addClass('loading');
      $(this).find('.btn-label').addClass('hidden');
      $(this).find('.loader').addClass('show');

      if (!validateEmail(profileEmail)) {
        // INVALID EMAIL

        // Reset Login button
        _this.removeClass('loading');
        _this.find('.btn-label').removeClass('hidden');
        _this.find('.loader').removeClass('show');
        // Show error
        _this.find('.login-error').html(T('widgets.login.dataSource.errors.emailInvalid')).removeClass('hidden');

        return;
      }

      // CHECK FOR EMAIL ON DATA SOURCE
      var where = {};

      where[DATA_DIRECTORY_EMAIL_COLUMN] = profileEmail;
      where[DATA_DIRECTORY_PASS_COLUMN] = profilePassword;
      loginFromDataSource(APP_VALIDATION_DATA_DIRECTORY_ID, where)
        .then(function(authorization) {
          if (typeof authorization !== 'object') {
            // Error message from Fliplet.API.request called in offline mode
            return Promise.reject(authorization);
          }

          Fliplet.Analytics.trackEvent({
            category: 'login_datasource',
            action: 'login_pass'
          });

          var entry = authorization.session.entries.dataSource;

          // Reset Login button
          userDataPV.entry = entry;
          userDataPV.userLogged = true;

          // Set PV to be used by Chat
          var user = createUserProfile(entry);

          return Promise.all([
            Fliplet.App.Storage.set({
              'fl-chat-source-id': entry.dataSourceId,
              'fl-chat-auth-email': profileEmail,
              'fl-login-data-source': entry
            }),
            Fliplet.Profile.set({
              'email': profileEmail,
              'user': user
            }),
            Fliplet.Security.Storage.update()
          ]).then(function() {
            return Fliplet.Hooks.run('login', {
              passport: 'dataSource',
              session: authorization.session,
              entry: entry,
              userProfile: user
            });
          });
        })
        .then(function() {
          _this.removeClass('loading');
          _this.find('.btn-label').removeClass('hidden');
          _this.find('.loader').removeClass('show');

          if (Fliplet.Env.get('disableSecurity')) {
            return Fliplet.UI.Toast({
              type: 'regular',
              duration: false,
              tapToDismiss: false,
              title: T('widgets.login.dataSource.successToast.title'),
              message: T('widgets.login.dataSource.successToast.message'),
              actions: [
                {
                  label: T('widgets.login.dataSource.successToast.ok'),
                  action: function() {
                    Fliplet.UI.Toast.dismiss();
                  }
                }
              ]
            });
          }

          if (typeof data.loginAction === 'undefined') {
            return Fliplet.UI.Toast(T('widgets.login.dataSource.successToast.title'));
          }

          return Fliplet.Navigate.to(data.loginAction);
        })
        .catch(function(error) {
          Fliplet.Analytics.trackEvent({
            category: 'login_datasource',
            action: 'login_fail'
          });

          // Reset Login button
          _this.removeClass('loading');
          _this.find('.btn-label').removeClass('hidden');
          _this.find('.loader').removeClass('show');
          _this.find('.login-error').html(Fliplet.parseError(error)).removeClass('hidden');
        });
    });

    // EVENT LISTENER FOR FORGET PASSWORD RESET
    // Just switches views Login to Email verification
    // Leave as it is
    $newPasswordInput.on('focus', function() {
      $newPasswordChecker.removeClass('hidden');
      calculateElHeight($('.state.present'));
    }).on('blur', function() {
      if (!$newPasswordInput.val()) {
        $newPasswordChecker.addClass('hidden');
        calculateElHeight($('.state.present'));
      }
    });

    $confirmPasswordInput.on('focus', function() {
      $confirmPasswordChecker.removeClass('hidden');
      calculateElHeight($('.state.present'));
    }).on('blur', function() {
      if (!$confirmPasswordInput.val()) {
        $confirmPasswordChecker.addClass('hidden');
        calculateElHeight($('.state.present'));
      }
    }).on('input', function() {
      validatePasswordConfirmation();
    });

    $newPasswordInput.on('input', function() {
      validatePassword();
      validatePasswordConfirmation();
    });

    $container.on('click keydown', '.btn-forget-pass', function(event) {
      if (event.type === 'click' || event.which === 32 || event.which === 13) {
        $container.find('.fl-login-holder').fadeOut(100, function() {
          $container.find('.fl-restore-pass').fadeIn(300);
          calculateElHeight($container.find('.state[data-state=verify-email]'));
        });
      }
    });

    $container.on('click keydown', '.back-login', function(event) {
      if (event.type === 'click' || event.which === 32 || event.which === 13) {
        $container.find('.fl-restore-pass').fadeOut(100, function() {
          $container.find('.fl-login-holder').fadeIn(250);

          // Reset states of email verification
          $container.find('.reset-email-error').addClass('hidden');
          $container.find('.pin-verify-error').addClass('hidden');
          $container.find('.pin-sent-error').addClass('hidden');
          $container.find('.state').removeClass('present past').addClass('future');
          $container.find('.state[data-state=verify-email]').removeClass('future').addClass('start');
        });
      }
    });

    $container.on('submit', '.form-verify-email', function(event) {
      event.preventDefault();

      var _this = $(this).find('.verify-identity');

      _this.addClass('loading');
      _this.find('.btn-label').addClass('hidden');
      _this.find('.loader').addClass('show');

      resetEmail = $container.find('input.reset-email-field').val().toLowerCase(); // Get email for reset

      $container.find('.reset-email-error').addClass('hidden');

      // EMAIL FOUND ON DATA SOURCE
      if ($container.find('.state[data-state=verify-email] .form-group').hasClass('has-error')) {
        $container.find('.state[data-state=verify-email] .form-group').removeClass('has-error');
      }

      // VALIDATE EMAIL
      if (!validateEmail(resetEmail)) {
        // INVALID EMAIL
        _this.removeClass('loading');
        _this.find('.btn-label').removeClass('hidden');
        _this.find('.loader').removeClass('show');
        $container.find('.reset-email-error').html(T('widgets.login.dataSource.restore.emailMismatch')).removeClass('hidden');
        $container.find('.state[data-state=verify-email] .form-group').addClass('has-error');
        calculateElHeight($container.find('.state[data-state=verify-email]'));

        return;
      }

      // CHECK FOR EMAIL ON DATA SOURCE
      var where = {};

      where[DATA_DIRECTORY_EMAIL_COLUMN] = resetEmail;

      Fliplet.Analytics.trackEvent({
        category: 'login_datasource',
        action: 'forgot_password'
      });

      resetFromDataSource(APP_VALIDATION_DATA_DIRECTORY_ID, where)
        .then(function() {
          if ($container.find('.state[data-state=verify-email] .form-group').hasClass('has-error')) {
            $container.find('.state[data-state=verify-email] .form-group').removeClass('has-error');
          }

          $container.find('.state[data-state=verify-email]').removeClass('present').addClass('past');
          $container.find('.verify-user-email').text(resetEmail); // UPDATES TEXT WITH EMAIL
          _this.removeClass('loading');
          _this.find('.btn-label').removeClass('hidden');
          _this.find('.loader').removeClass('show');
          calculateElHeight($container.find('.state[data-state=verify-code]'));
          $container.find('.state[data-state=verify-code]').removeClass('future').addClass('present');
        })
        .catch(function(error) {
          // EMAIL NOT FOUND ON DATA SOURCE
          console.error('Error resetting password', error);
          _this.removeClass('loading');
          _this.find('.btn-label').removeClass('hidden');
          _this.find('.loader').removeClass('show');
          $container.find('.reset-email-error').html(Fliplet.parseError(error)).removeClass('hidden');
          $container.find('.state[data-state=verify-email] .form-group').addClass('has-error');
          calculateElHeight($container.find('.state[data-state=verify-email]'));
        });
    });

    $container.on('click', '.back.start', function() {
      $container.find('.state.present').removeClass('present').addClass('future');

      $container.find('.reset-email-field').val(''); // RESETS EMAIL VALUE
      $container.find('.pin-code-field').val(''); // RESETS PIN

      // REMOVES ERROR MESSAGE ON CURRENT STATE IF THERE IS ONE
      if ($container.find('.state[data-state=verify-code] .form-group').hasClass('has-error')) {
        $container.find('.state[data-state=verify-code] .form-group').removeClass('has-error');
      }

      // check the validation current state.
      if (userDataPV.code !== '' && userDataPV.code_generated_at > Date.now() - (CODE_VALID * 60 * 1000)) {
        $container.find('.have-code').removeClass('hidden');
      }

      $container.find('.authenticate, .verify-identity').removeClass('loading');
      $container.find('.authenticate, .verify-identity').find('.btn-label').removeClass('hidden');
      $container.find('.authenticate, .verify-identity').find('.loader').removeClass('show');

      calculateElHeight($container.find('.state[data-state=verify-email]'));
      $container.find('.state[data-state=verify-email]').removeClass('past').addClass('present');
    });

    $container.on('click', '.have-code', function() {
      // TRANSITION
      $container.find('.state.present').removeClass('present').addClass('past');
      $container.find('.verify-user-email').text(userDataPV.email); // UPDATES TEXT WITH EMAIL

      calculateElHeight($container.find('.state[data-state=verify-code]'));
      $container.find('.state[data-state=verify-code]').removeClass('future').addClass('present');
    });

    $container.on('submit', '.form-verify-code', function(event) {
      event.preventDefault();

      var _this = $(this).find('.authenticate');

      $container.find('.pin-sent-success, .pin-verify-error, .pin-sent-error').addClass('hidden');
      // Simulates loading
      $(this).addClass('loading');
      $(this).find('.btn-label').addClass('hidden');
      $(this).find('.loader').addClass('show');

      var code = $container.find('.pin-code-field').val();

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
                    Fliplet.App.Storage.set({
                      'fl-chat-source-id': entry.dataSourceId,
                      'fl-chat-auth-email': resetEmail,
                      'fl-email-verification': entry
                    }),
                    Fliplet.Profile.set('email', resetEmail)
                  ]).then(function() {
                    return Fliplet.Hooks.run('onUserVerified', { entry: entry });
                  });
                })
                .then(function() {
                  if ($container.find('.state[data-state=verify-code] .form-group').hasClass('has-error')) {
                    $container.find('.state[data-state=verify-code] .form-group').removeClass('has-error');
                  }

                  userDataPV.resetVerified = true;
                  userDataPV.code = '';
                  userDataPV.code_generated_at = '';
                  Fliplet.Security.Storage.update().then(function() {
                    _this.removeClass('loading');
                    _this.find('.btn-label').removeClass('hidden');
                    _this.find('.loader').removeClass('show');

                    $container.find('.state.present').removeClass('present').addClass('past');
                    calculateElHeight($container.find('.state[data-state=reset-password]'));
                    $container.find('.state[data-state=reset-password]').removeClass('future').addClass('present');

                    // Analytics - Info Event
                    Fliplet.Analytics.info({
                      email: userDataPV.email,
                      action: 'search'
                    });
                  });
                })
                .catch(function() {
                  $container.find('.state[data-state=verify-code] .form-group').addClass('has-error');
                  $container.find('.resend-code').removeClass('hidden');
                  _this.removeClass('loading');
                  _this.find('.btn-label').removeClass('hidden');
                  _this.find('.loader').removeClass('show');
                  $container.find('.pin-verify-error').removeClass('hidden');
                  calculateElHeight($container.find('.state[data-state=verify-code]'));
                });
            });
        });
    });

    // UPDATE PASSWORD
    $container.on('submit', '.form-reset-password', function(event) {
      event.preventDefault();

      if (!isValidPassword) {
        $newPasswordChecker.addClass('panel-danger');

        return;
      }

      $newPasswordChecker.removeClass('panel-danger');

      var _this = $(this).find('.update-password');

      _this.addClass('loading');
      _this.find('.btn-label').addClass('hidden');
      _this.find('.loader').addClass('show');

      var newPassword = $container.find('.new-password').val();
      var confirmPassword = $container.find('.confirm-password').val();
      var error = '';

      if (!newPassword || !confirmPassword) {
        error = T('widgets.login.dataSource.errors.newPasswordMissing');
      }

      if (newPassword !== confirmPassword) {
        $confirmPasswordChecker.addClass('panel-danger');
        error = T('widgets.login.dataSource.errors.passwordMismatch');
      }

      if (error) {
        $container.find('.reset-password-error').html(error);
        $container.find('.reset-password-error').removeClass('hidden');

        // Removes loading
        _this.removeClass('loading');
        _this.find('.btn-label').removeClass('hidden');
        _this.find('.loader').removeClass('show');

        calculateElHeight($container.find('.state[data-state=reset-password]'));

        return;
      }

      $confirmPasswordChecker.removeClass('panel-danger');

      Fliplet.Session.get().then(function(session) {
        if (session.entries && session.entries.dataSource) {
          return Fliplet.DataSources.connect(data.dataSource, { offline: false }).then(function(dataSource) {
            var options = {
              type: 'update',
              where: {},
              dataSourceEntryId: dataSourceEntry.id,
              data: {}
            };

            options.where[data.emailColumn] = { $iLike: resetEmail };
            options.data[data.passColumn] = newPassword;

            return dataSource.query(options)
              .then(function onPasswordUpdateSuccess(affected) {
                if (!affected || !affected.length) {
                  return Promise.reject(T('widgets.login.dataSource.errors.accountNotFound', { email: resetEmail }));
                }

                _this.removeClass('loading');
                _this.find('.btn-label').removeClass('hidden');
                _this.find('.loader').removeClass('show');

                $container.find('.state.present').removeClass('present').addClass('past');
                calculateElHeight($container.find('.state[data-state=all-done]'));
                $container.find('.state[data-state=all-done]').removeClass('future').addClass('present');
              })
              .catch(function onPasswordUpdateError(error) {
                // Query failed due to some data source misconfiguration or access denied
                _this.removeClass('loading');
                _this.find('.btn-label').removeClass('hidden');
                _this.find('.loader').removeClass('show');

                $container.find('.reset-password-error').html(Fliplet.parseError(error) || T('widgets.login.dataSource.errors.unknown'));
                $container.find('.reset-password-error').removeClass('hidden');
                calculateElHeight($container.find('.state[data-state="reset-password"]'));
              });
          });
        }

        // User tried to update password without being verified
        _this.removeClass('loading');
        _this.find('.btn-label').removeClass('hidden');
        _this.find('.loader').removeClass('show');

        $container.find('.state.present').removeClass('present').addClass('future');

        $container.find('.reset-email-field').val(''); // RESETS EMAIL VALUE
        $container.find('.pin-code-field').val(''); // RESETS PIN

        // check the validation current state.
        if (userDataPV.code !== '' && userDataPV.code_generated_at > Date.now() - (CODE_VALID * 60 * 1000)) {
          $container.find('.have-code').removeClass('hidden');
        }

        $container.find('.authenticate').removeClass('loading');
        $container.find('.authenticate').find('.btn-label').removeClass('hidden');
        $container.find('.authenticate').find('.loader').removeClass('show');

        $container.find('.reset-email-error').html(T('widgets.login.dataSource.errors.verifyEmailFirst')).removeClass('hidden');
        $container.find('.state[data-state=verify-email] .form-group').addClass('has-error');

        calculateElHeight($container.find('.state[data-state=verify-email]'));
        $container.find('.state[data-state=verify-email]').removeClass('past').addClass('present');
      });
    });

    // RESEND CODE
    $container.on('click', '.resend-code', function() {
      $container.find('.pin-verify-error, .pin-sent-error, .pin-sent-success').addClass('hidden');
      $container.find('.pin-code-field').val('');
      $container.find('.state[data-state=verify-code] .form-group').removeClass('has-error');
      $container.find('.resend-code').addClass('hidden');

      calculateElHeight($container.find('.state[data-state=verify-code]'));

      Fliplet.DataSources.connect(data.dataSource, { offline: false })
        .then(function(dataSource) {
          var where = {};

          where[data.emailColumn] = resetEmail;
          dataSource.sendValidation({ type: 'email', where: where })
            .then(function() {
              $container.find('.pin-code-field').val('');
              $container.find('.pin-sent-success').removeClass('hidden');

              if ($container.find('.state[data-state=verify-code] .form-group').hasClass('has-error')) {
                $container.find('.state[data-state=verify-code] .form-group').removeClass('has-error');
              }

              if (!$container.find('.resend-code').hasClass('hidden')) {
                $container.find('.resend-code').addClass('hidden');
              }

              calculateElHeight($container.find('.state[data-state=verify-code]'));
            })
            .catch(function(error) {
              console.error('Error resending code', error);
              $container.find('.pin-sent-error').text(Fliplet.parseError(error)).removeClass('hidden');
            });
        });
    });
  }

  function setUserDataPV(successCallback, failCallback) {
    var structure = {
      resetVerified: false,
      code: '',
      code_generated_at: '',
      email: '',
      userLogged: false
    };

    Fliplet.Security.Storage.create('login-data-source', structure).then(function(data) {
      userDataPV = data;
      successCallback();
    }, failCallback);
  }

  Fliplet().then(function() {
    $container.translate();

    initEmailValidation();

    if (Fliplet.Env.get('interact')) {
      // Disables password fields in edit mode to avoid password autofill
      $('input[type="password"]').prop('disabled', true);
    }

    if (Fliplet.Env.is('web')) {
      $container.on('fliplet_page_reloaded', initEmailValidation);
    }
  });
});
