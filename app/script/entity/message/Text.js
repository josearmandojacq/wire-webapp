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
window.z.entity = z.entity || {};

z.entity.Text = class Text extends z.entity.Asset {
  constructor(id, text = '') {
    super(id);
    this.type = z.assets.AssetType.TEXT;
    this.nonce = undefined;

    // Raw message text
    this.text = text;

    // Can be used to theme media embeds
    this.theme_color = undefined;

    // Array of z.entity.LinkPreview instances
    this.previews = ko.observableArray();

    this.should_render_text = ko.pureComputed(() => {
      if (this.text === null || this.text.length === 0) {
        return false;
      }
      const has_link_previews = this.previews().length > 0;
      return !has_link_previews || (has_link_previews && !z.links.LinkPreviewHelpers.contains_only_link(this.text));
    });
  }

  // Process text before rendering it
  render() {
    let message = z.util.render_message(this.text);
    if (!this.previews().length) {
      message = z.media.MediaParser.render_media_embeds(message, this.theme_color);
    }
    return message;
  }
};
