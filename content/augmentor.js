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

import blockies from 'blockies';

import Runner from './runner';
import { FETCH_IMAGE } from '../background/processor';

import styles from './styles.css';

export default class Augmentor {

  static getBadge (badge, height) {
    const { src, title } = badge;

    const image = new Image();

    image.src = src;
    image.title = title;
    image.className = styles.badge;
    image.style = `height: ${height}px;`;

    return image;
  }

  static augmentNode (key, node, resolved = {}) {
    if (!node || node.getAttribute('data-parity-touched') === 'true') {
      return;
    }

    node.setAttribute('data-parity-touched', true);

    if (!resolved[key]) {
      return;
    }

    const { address, badges } = resolved[key];

    const badgesPromises = badges.map((badge) => {
      return Runner.execute(FETCH_IMAGE, badge.img)
        .then((src) => ({ ...badge, src }));
    });

    const { height = 16 } = node.getBoundingClientRect();

    const icon = blockies({
      seed: (address || '').toLowerCase(),
      size: 8,
      scale: 8
    }).toDataURL();

    Promise
      .all(badgesPromises)
      .then((badgesData) => {
        const badgesElements = badgesData.map((badge) => Augmentor.getBadge(badge, height));
        const badgesElements2 = badgesData.map((badge) => Augmentor.getBadge(badge, height));

        // The Ethereum Addres Identity Icon
        const blockieElement = Augmentor.getBadge({ src: icon, title: address }, height);

        // The Badges container
        const badgesElement = document.createElement('span');
        badgesElement.className = styles.badges;
        badgesElements.forEach((elt) => badgesElement.appendChild(elt));
        badgesElements2.forEach((elt) => badgesElement.appendChild(elt));

        // The main Container
        const iconsElement = document.createElement('span');
        iconsElement.setAttribute('data-parity-touched', true);
        iconsElement.className = styles.icons;
        iconsElement.appendChild(blockieElement);
        iconsElement.appendChild(badgesElement);

        iconsElement.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });

        node.className += ` ${styles.container}`;
        node.appendChild(iconsElement);

        const badgesRect = badgesElement.getBoundingClientRect();
        const pageWidth = document.body.clientWidth;

        // If 5px or less of right border
        if (badgesRect.right >= pageWidth - 5) {
          const nextLeft = pageWidth - 5 - badgesRect.width;
          badgesElement.style.left = `${nextLeft}px`;
        }

        // If 5px of less of left border
        if (badgesRect.left <= 5) {
          badgesElement.style.left = `5px`;
        }
      });
  }

  static run (matches, resolved = {}) {
    // Use the attributes matcher first
    const attributesMatches = matches.filter((match) => match.from === 'attributes');
    const textMatches = matches.filter((match) => match.from === 'text');

    attributesMatches
      .forEach((match) => {
        const { email, node } = match;
        Augmentor.augmentNode(email, node, resolved);
      });

    textMatches
      .forEach((match) => {
        const { email, node } = match;

        // Safe Node is if the node which inner text is only the email address
        let safeNode = node.innerText.trim() === email
          ? node
          : null;

        // If it has more text, try to separate in SPANs
        if (!safeNode) {
          const emailIndex = node.innerText.indexOf(email);

          if (emailIndex === -1) {
            return;
          }

          const beforeText = node.innerText.slice(0, emailIndex);
          const afterText = node.innerText.slice(emailIndex + email.length);

          node.innerHTML = `${beforeText}<span>${email}</span>${afterText}`;
          safeNode = node.querySelector('span');
        }

        if (!safeNode) {
          return;
        }

        Augmentor.augmentNode(email, safeNode, resolved);
      });
  }

}