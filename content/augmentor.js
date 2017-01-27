// Copyright 2015, 2016 Parity Technologies (UK) Ltd.
// This file is part of Parity.

// Parity is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Parity is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Parity.  If not, see <http://www.gnu.org/licenses/>.

import { h, render } from 'preact';

import { AugmentedIcon } from './components';
import { EXTRACT_TYPE_HANDLE, EXTRACT_TYPE_GITHUB } from './extraction';
import Accounts from './accounts';
import Runner from './runner';
import { FETCH_IMAGE } from '../background/processor';

export const AUGMENTED_NODE_ATTRIBUTE = 'data-parity-touched';

export default class Augmentor {

  static getSafeNodes (extraction, node) {
    const { text } = extraction;
    const content = node.textContent || '';

    // Already the safe node if the inner text is only the value
    if (content.trim() === text.trim()) {
      return [ node ];
    }

    const safeNodes = [];
    let safeNode = Augmentor.getSafeNode(text, node);

    while (safeNode) {
      safeNodes.push(safeNode.node);
      safeNode = Augmentor.getSafeNode(text, safeNode.after);
    }

    return safeNodes;
  }

  static getSafeNode (value, node) {
    const text = node.textContent || '';

    const valueIndex = text.indexOf(value);

    if (valueIndex === -1) {
      return;
    }

    // If there are children, not yet at the base text node
    if (node.childElementCount) {
      const textNode = Array.prototype.slice
        .apply(node.childNodes)
        .find((node) => node.textContent.includes(value));

      const safeNode = Augmentor.getSafeNode(value, textNode);
      return safeNode && safeNode.node;
    }

    const beforeText = text.slice(0, valueIndex);
    const afterText = text.slice(valueIndex + value.length);

    const beforeNode = document.createTextNode(beforeText);
    const afterNode = document.createTextNode(afterText);

    const safeNode = document.createElement('span');
    safeNode.innerText = value;

    if (node.nodeName === '#text') {
      const nextNode = document.createElement('span');
      nextNode.appendChild(beforeNode);
      nextNode.appendChild(safeNode);
      nextNode.appendChild(afterNode);
      node.parentElement.replaceChild(nextNode, node);
    } else {
      // Don't replace the node if it's not a text node
      // in order to keep bindings
      node.innerHTML = '';
      node.appendChild(beforeNode);
      node.appendChild(safeNode);
      node.appendChild(afterNode);
    }

    return { after: afterNode, node: safeNode };
  }

  static augmentNode (extraction, node) {
    if (!node || node.hasAttribute(AUGMENTED_NODE_ATTRIBUTE)) {
      return;
    }

    const rawText = node.textContent;
    const text = (rawText || '').trim();

    const data = Accounts.find(extraction.address);
    node.setAttribute(AUGMENTED_NODE_ATTRIBUTE, true);

    // Don't augment empty nodes
    if (text.length === 0) {
      return;
    }

    if (!data) {
      return;
    }

    return Augmentor.fetchImages(data)
      .then(([ badges, tokens ]) => {
        const { address, name } = data;
        const { height = 16 } = node.getBoundingClientRect();
        const iconHeight = Math.min(height, 20);
        const safe = extraction.type !== EXTRACT_TYPE_HANDLE;

        // If from Github, display the Github handle if
        // no name linked
        const displayName = extraction.type === EXTRACT_TYPE_GITHUB
          ? name || extraction.match
          : name;

        const augmentedIcon = render((
          <AugmentedIcon
            address={ address }
            badges={ badges }
            height={ iconHeight }
            name={ displayName }
            safe={ safe }
            tokens={ tokens }
          />
        ));

        // Set the proper height if it has been modified
        if (height !== iconHeight) {
          augmentedIcon.style.top = (height - iconHeight) / 2 + 'px';
        }

        node.insertAdjacentElement('beforebegin', augmentedIcon);
      })
      .catch((error) => {
        console.error('augmenting node', extraction.toObject(), error);
      });
  }

  static fetchImages (data) {
    const { badges = [], tokens = [] } = data;

    const badgesPromises = badges
      .map((badge) => {
        return Runner.execute(FETCH_IMAGE, badge.img)
          .then((src) => ({ ...badge, src }));
      });

    const tokensPromises = tokens
      .map((token) => {
        return Runner.execute(FETCH_IMAGE, token.img)
          .then((src) => ({ ...token, src }));
      });

    return Promise.all([ Promise.all(badgesPromises), Promise.all(tokensPromises) ]);
  }

}
