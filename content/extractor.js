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

// Given DOM element returns array of possible id-links to resolve.

import Augmentor, { AUGMENTED_NODE_ATTRIBUTE } from './augmentor';
import Accounts from './accounts';
import Extractions, { TAGS_BLACKLIST } from './extractions';

export default class Extractor {

  /**
   * First try to find a match from the nodes
   * attributes, then from the nodes text content
   */
  static run (root = document.body) {
    Extractor.processAttributeNodes(root)
      .then(() => Extractor.processTextNodes(root));
  }

  static processAttributeNodes (root = document.body) {
    const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const promises = [];

    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;

      if (node.hasAttribute(AUGMENTED_NODE_ATTRIBUTE)) {
        continue;
      }

      const extractions = new Extractions();

      extractions.fromAttributes(node);

      // Nothing found, move on
      if (extractions.empty()) {
        continue;
      }

      const promise = Accounts.processExtractions(extractions)
        .then(() => {
          // Find the first extraction with a result,
          // sorted by priority
          const extraction = extractions.first();

          if (!extraction) {
            return null;
          }

          return Augmentor.augmentNode(extraction, node);
        });

      promises.push(promise);
    }

    return Promise.all(promises);
  }

  static processTextNodes (root = document.body) {
    const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const promises = [];

    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;
      let parentNode = node.parentElement;

      // Don't extract from blacklisted DOM Tags
      if (TAGS_BLACKLIST.includes(parentNode.tagName.toLowerCase())) {
        continue;
      }

      if (parentNode.hasAttribute(AUGMENTED_NODE_ATTRIBUTE)) {
        continue;
      }

      const text = node.textContent;
      const extractions = new Extractions();

      extractions.fromText(text);

      if (extractions.empty()) {
        continue;
      }

      /** @todo  For each extraction, find ALL occurencies/safe nodes and augment them */
      // const promise = Runner.execute(PROCESS_MATCHES, extractions.toObject())
      //   .then((result = {}) => {
      //     extractions.forEach((extraction) => {
      //       const { key } = extraction;

      //       if (!result[key]) {
      //         return null;
      //       }

      //       const safeNode = Augmentor.getSafeNode(key, parentNode);
      //       parentNode = safeNode.parentElement;
      //       return Augmentor.augmentNode(key, safeNode, result);
      //     });
      //   })
      //   .catch((error) => {
      //     console.error('extracting', node, error);
      //   });

      // promises.push(promise);
    }

    return Promise.all(promises);
  }

}
