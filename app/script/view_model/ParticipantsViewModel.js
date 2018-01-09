/*
 * Wire
 * Copyright (C) 2017 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

'use strict';

window.z = window.z || {};
window.z.ViewModel = z.ViewModel || {};

z.ViewModel.ParticipantsViewModel = class ParticipantsViewModel {
  static get STATE() {
    return {
      ADD_PEOPLE: 'add_people',
      PARTICIPANTS: 'participants',
    };
  }

  constructor(element_id, user_repository, conversation_repository, search_repository, team_repository) {
    this.add_people = this.add_people.bind(this);
    this.block = this.block.bind(this);
    this.close = this.close.bind(this);
    this.click_on_participant = this.click_on_participant.bind(this);
    this.connect = this.connect.bind(this);
    this.leave_conversation = this.leave_conversation.bind(this);
    this.on_search_close = this.on_search_close.bind(this);
    this.pending = this.pending.bind(this);
    this.remove = this.remove.bind(this);
    this.show_participant = this.show_participant.bind(this);
    this.unblock = this.unblock.bind(this);

    this.element_id = element_id;
    this.user_repository = user_repository;
    this.conversation_repository = conversation_repository;
    this.search_repository = search_repository;
    this.team_repository = team_repository;
    this.logger = new z.util.Logger('z.ViewModel.ParticipantsViewModel', z.config.LOGGER.OPTIONS);

    this.state = ko.observable(ParticipantsViewModel.STATE.PARTICIPANTS);

    this.conversation = ko.observable(new z.entity.Conversation());
    this.conversation.subscribe(() => this.render_participants(false));

    this.isTeam = this.team_repository.isTeam;
    this.team = this.team_repository.team;
    this.teamUsers = this.team_repository.teamUsers;

    this.render_participants = ko.observable(false);

    this.group_mode = ko.observable(false);

    this.participants = ko.observableArray();
    this.participants_verified = ko.observableArray();
    this.participants_unverified = ko.observableArray();

    this.placeholder_participant = new z.entity.User();

    ko.computed(() => {
      const conversation_et = this.conversation();
      const participants = []
        .concat(conversation_et.participating_user_ets())
        .sort((user_a, user_b) => z.util.StringUtil.sort_by_priority(user_a.first_name(), user_b.first_name()));

      this.participants(participants);
      this.participants_verified.removeAll();
      this.participants_unverified.removeAll();

      participants.map(user_et => {
        if (user_et.is_verified()) {
          return this.participants_verified.push(user_et);
        }
        this.participants_unverified.push(user_et);
      });
    });

    // Confirm dialog reference
    this.confirm_dialog = undefined;

    // Selected group user
    this.user_profile = ko.observable(this.placeholder_participant);

    // Switch between div and input field to edit the conversation name
    this.editing = ko.observable(false);
    this.editable = ko.pureComputed(() => !this.conversation().removed_from_conversation());
    this.edit = function() {
      if (this.editable()) {
        this.editing(true);
      }
    };

    this.editing.subscribe(value => {
      if (!value) {
        const name = $('.group-header .name span');
        return $('.group-header textarea').css('height', `${name.height()}px`);
      }
      $('.group-header textarea').val(this.conversation().display_name());
    });

    this.participants_bubble = new zeta.webapp.module.Bubble({
      host_selector: '#show-participants',
      modal: true,
      on_hide: () => this.reset_view(),
      scroll_selector: '.messages-wrap',
    });

    // @todo create a viewmodel search?
    this.search_action = ko.pureComputed(() => {
      if (this.conversation()) {
        const is_group = this.conversation().is_group();
        return is_group ? z.string.people_confirm_label : z.string.search_open_group;
      }
    });

    this.user_input = ko.observable('');
    this.user_selected = ko.observableArray([]);

    this.users = ko.pureComputed(() => {
      const user_ets = this.isTeam() ? this.teamUsers() : this.user_repository.connected_users();

      return user_ets
        .filter(user_et => !this.participants().find(participant => user_et.id === participant.id))
        .sort((user_a, user_b) => z.util.StringUtil.sort_by_priority(user_a.first_name(), user_b.first_name()));
    });

    const shortcut = z.ui.Shortcut.get_shortcut_tooltip(z.ui.ShortcutType.ADD_PEOPLE);
    this.add_people_tooltip = z.l10n.text(z.string.tooltip_people_add, shortcut);

    amplify.subscribe(z.event.WebApp.CONTENT.SWITCH, this.switch_content.bind(this));
    amplify.subscribe(z.event.WebApp.PEOPLE.SHOW, this.show_participant);
    amplify.subscribe(z.event.WebApp.PEOPLE.TOGGLE, this.toggle_participants_bubble.bind(this));
  }

  click_on_participant(user_et) {
    this.show_participant(user_et, true);
  }

  show_participant(user_et, group_mode = false) {
    if (user_et) {
      this.user_profile(user_et);
      this.group_mode(group_mode);
    }
  }

  switch_content(content_state) {
    if (content_state === z.ViewModel.content.CONTENT_STATE.CONNECTION_REQUESTS) {
      this.participants_bubble.hide();
    }
  }

  toggle_participants_bubble(add_people = false) {
    const toggle_bubble = () => {
      if (!this.participants_bubble.is_visible()) {
        this.reset_view();

        const [user_et] = this.participants();
        if (user_et && !this.conversation().is_group()) {
          this.user_profile(user_et);
        } else {
          this.user_profile(this.placeholder_participant);
        }

        this.render_participants(true);
      }

      if (add_people && !this.conversation().is_guest()) {
        if (!this.participants_bubble.is_visible()) {
          return this.participants_bubble.show().then(() => this.add_people());
        }

        const is_adding_people = this.state() === ParticipantsViewModel.STATE.ADD_PEOPLE;
        const is_confirming = this.confirm_dialog && this.confirm_dialog.is_visible();
        if (is_adding_people || is_confirming) {
          return this.participants_bubble.hide();
        }

        return this.add_people();
      }

      return this.participants_bubble.toggle();
    };

    const bubble = wire.app.view.content.message_list.participant_bubble;
    if (bubble && bubble.is_visible()) {
      window.setTimeout(() => {
        toggle_bubble();
      }, 550);
    } else {
      toggle_bubble();
    }
  }

  change_conversation(conversation_et) {
    this.participants_bubble.hide();
    this.conversation(conversation_et);
    this.user_profile(this.placeholder_participant);
  }

  reset_view() {
    this.state(ParticipantsViewModel.STATE.PARTICIPANTS);
    this.user_selected.removeAll();
    if (this.confirm_dialog) {
      this.confirm_dialog.destroy();
    }
    this.user_profile(this.placeholder_participant);
  }

  add_people() {
    this.state(ParticipantsViewModel.STATE.ADD_PEOPLE);
    $('.participants-search').addClass('participants-search-show');
  }

  leave_conversation() {
    amplify.publish(z.event.WebApp.AUDIO.PLAY, z.audio.AudioType.ALERT);

    this.confirm_dialog = $('#participants').confirm({
      confirm: () => {
        this.participants_bubble.hide();
        this.conversation_repository.remove_member(this.conversation(), this.user_repository.self().id);
      },
      template: '#template-confirm-leave',
    });
  }

  rename_conversation(data, event) {
    const new_name = z.util.StringUtil.remove_line_breaks(event.target.value.trim());
    const old_name = this.conversation()
      .display_name()
      .trim();

    event.target.value = old_name;
    this.editing(false);
    if (new_name.length && new_name !== old_name) {
      this.conversation_repository.rename_conversation(this.conversation(), new_name);
    }
  }

  on_search_add() {
    const user_ids = this.user_selected().map(user_et => user_et.id);
    if (this.conversation().is_group()) {
      this.conversation_repository.add_members(this.conversation(), user_ids).then(() => {
        amplify.publish(z.event.WebApp.ANALYTICS.EVENT, z.tracking.EventName.CONVERSATION.ADD_TO_GROUP_CONVERSATION, {
          numberOfGroupParticipants: this.conversation().get_number_of_participants(),
          numberOfParticipantsAdded: user_ids.length,
        });
      });
    } else {
      this.conversation_repository
        .create_new_conversation(user_ids.concat(this.user_profile().id), null)
        .then(conversationEntity => {
          amplify.publish(z.event.WebApp.ANALYTICS.EVENT, z.tracking.EventName.CONVERSATION.CREATE_GROUP_CONVERSATION, {
            creationContext: 'addedToOneToOne',
            numberOfParticipants: user_ids.length,
          });

          amplify.publish(z.event.WebApp.CONVERSATION.SHOW, conversationEntity);
        });
    }

    this.participants_bubble.hide();
  }

  on_search_close() {
    this.reset_view();
  }

  close() {
    this.reset_view();
  }

  remove(user_et) {
    amplify.publish(z.event.WebApp.AUDIO.PLAY, z.audio.AudioType.ALERT);

    this.confirm_dialog = $('#participants').confirm({
      confirm: () => {
        this.conversation_repository.remove_participant(this.conversation(), user_et).then(response => {
          if (response) {
            this.reset_view();
          }
        });
      },
      data: {
        user: user_et,
      },
      template: '#template-confirm-remove',
    });
  }

  show_preferences_account() {
    amplify.publish(z.event.WebApp.PREFERENCES.MANAGE_ACCOUNT);
  }

  unblock(user_et) {
    this.confirm_dialog = $('#participants').confirm({
      confirm: () => {
        this.user_repository
          .unblock_user(user_et)
          .then(() => {
            this.participants_bubble.hide();
            return this.conversation_repository.get_1to1_conversation(user_et);
          })
          .then(conversation_et => {
            this.conversation_repository.update_participating_user_ets(conversation_et);
          });
      },
      data: {
        user: user_et,
      },
      template: '#template-confirm-unblock',
    });
  }

  block(user_et) {
    amplify.publish(z.event.WebApp.AUDIO.PLAY, z.audio.AudioType.ALERT);

    this.confirm_dialog = $('#participants').confirm({
      confirm: () => {
        const next_conversation_et = this.conversation_repository.get_next_conversation(this.conversation());

        this.participants_bubble.hide();
        this.user_repository.block_user(user_et, next_conversation_et);
      },
      data: {
        user: user_et,
      },
      template: '#template-confirm-block',
    });
  }

  connect(user_et) {
    this.participants_bubble.hide();

    amplify.publish(z.event.WebApp.ANALYTICS.EVENT, z.tracking.EventName.CONNECT.SENT_CONNECT_REQUEST, {
      context: 'participants',
    });
  }

  pending(user_et) {
    const on_success = () => this.participants_bubble.hide();

    this.confirm_dialog = $('#participants').confirm({
      cancel: () => {
        this.user_repository.ignore_connection_request(user_et).then(() => on_success());
      },
      confirm: () => {
        this.user_repository.accept_connection_request(user_et, true).then(() => on_success());
      },
      data: {
        user: this.user_profile(),
      },
      template: '#template-confirm-connect',
    });
  }
};
